"""Authorization is a publishing boundary, not a build-workflow assertion."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "script"))
import gallery_pages as pages

SHA = "a" * 40


def pull():
    return {"number": 12, "state": "open", "base": {"ref": "main"},
            "head": {"sha": SHA, "repo": {"id": 99}}, "user": {"id": 1}}


def rerun():
    return {"id": 10, "run_attempt": 2, "workflow_id": 4, "event": "pull_request",
            "conclusion": "success", "status": "completed", "head_sha": SHA,
            "run_started_at": "2026-10-08T12:01:00Z",
            "head_repository": {"id": 99}, "repository": {"full_name": "owner/repo"},
            "pull_requests": [{"number": 12}], "actor": {"id": 1, "login": "contributor"},
            "triggering_actor": {"id": 2, "login": "maintainer"}, "head_branch": "feature"}


class PolicyTests(unittest.TestCase):
    def test_permission_required(self):
        for role in ["write", "maintain", "admin"]:
            allowed = pages.authorize_preview(pull(), "read", rerun(), role)
            self.assertEqual(allowed["actor_id"], 2)
            self.assertEqual(allowed["sha"], SHA)
        for role in ["read", "triage", "MEMBER", "OWNER", ""]:
            self.assertIsNone(pages.authorize_preview(pull(), "read", rerun(), role))

    def test_current_head_only(self):
        pr = pull(); pr["head"]["sha"] = "b" * 40
        self.assertIsNone(pages.authorize_preview(pr, "read", rerun(), "admin"))

    def test_closed_or_wrong_base_denied(self):
        for field, value in [("state", "closed"), ("base", {"ref": "dev"}), ("head", {"sha": SHA, "repo": None})]:
            pr = pull(); pr[field] = value
            self.assertIsNone(pages.authorize_preview(pr, "admin", rerun(), "write"))

    def test_missing_api_fields_fail_closed(self):
        with self.assertRaises((KeyError, ValueError)):
            pages.authorize_preview({}, "admin")

    def test_indirect_build_inputs_are_relevant(self):
        for path in ["src/styles.ts", "gallery/src/catalog.ts", "homeassistant-frontend", "yarn.lock", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".nvmrc", "script/bootstrap", ".yarn/patches/x.patch", "test/gallery-thumbnails.ts"]:
            self.assertTrue(pages.has_gallery_changes([path]), path)
        self.assertFalse(pages.has_gallery_changes(["README.md", "docs/example.md", "test/unrelated.test.ts"]))

    def test_rerun_cannot_change_build_sha(self):
        self.assertFalse(pages.same_head(SHA, {**pull(), "head": {"sha": "b" * 40}}))
        self.assertTrue(pages.same_head(SHA, pull()))


class ControlTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(pages.os.environ, {"GITHUB_REPOSITORY": "owner/repo"})
        env.start(); self.addCleanup(env.stop)

    def run_data(self):
        return rerun()

    def test_unrelated_run_is_denied(self):
        run = self.run_data(); run["workflow_id"] = 8
        with patch.dict(pages.os.environ, {"GITHUB_REPOSITORY": "owner/repo"}), patch.object(pages, "github_request", side_effect=[run, {"id": 4}]):
            self.assertIsNone(pages.resolve_build_run({"workflow_run": self.run_data()}))

    def test_metadata_cannot_choose_target(self):
        run = self.run_data()
        def api(method, path, body=None):
            if path.endswith("/runs/10"): return run
            if path.endswith("/workflows/gallery-build.yml"): return {"id": 4}
            if path.endswith("/pulls/12"): return pull()
            raise AssertionError(path)
        with patch.dict(pages.os.environ, {"GITHUB_REPOSITORY": "owner/repo"}), patch.object(pages, "github_request", side_effect=api), patch.object(pages, "authorization", return_value={"sha": SHA, "comment_id": None, "actor_id": 2, "kind": "rerun"}):
            resolved = pages.resolve_build_run({"workflow_run": run})
            self.assertEqual(resolved["pr_number"], 12)
            self.assertEqual(resolved["sha"], SHA)
            self.assertEqual(resolved["run_attempt"], 2)

    def test_empty_fork_association_is_resolved_or_denied(self):
        run = self.run_data(); run["pull_requests"] = []
        def api(method, path, body=None):
            if path.endswith("/runs/10"): return run
            if path.endswith("/workflows/gallery-build.yml"): return {"id": 4}
            if "/pulls/" in path: return pull()
            raise AssertionError(path)
        with patch.object(pages, "github_request", side_effect=api), patch.object(pages, "authorization", return_value={"comment_id": None, "actor_id": 2, "kind": "rerun"}), patch.object(pages, "github_pages", return_value=[{"number":12}]):
            self.assertEqual(pages.resolve_build_run({"workflow_run": run})["pr_number"], 12)
        with patch.object(pages, "github_request", side_effect=api), patch.object(pages, "github_pages", return_value=[]):
            self.assertIsNone(pages.resolve_build_run({"workflow_run": run}))
        with patch.object(pages, "github_request", side_effect=api), patch.object(pages, "authorization", return_value={"comment_id": None, "actor_id": 2, "kind": "rerun"}), patch.object(pages, "github_pages", return_value=[{"number":12}, {"number":13}]):
            self.assertIsNone(pages.resolve_build_run({"workflow_run": run}))

    def test_stale_attempt_and_wrong_head_repo_denied(self):
        run = self.run_data()
        with patch.object(pages, "github_request", side_effect=[run, {"id":4}]):
            self.assertIsNone(pages.resolve_build_run({"workflow_run": {"id":10,"run_attempt":1}}))
        pr = pull(); pr["head"]["repo"]["id"] = 88
        with patch.object(pages, "github_request", side_effect=[run, {"id":4}, pr]), patch.object(pages, "authorization") as auth:
            self.assertIsNone(pages.resolve_build_run({"workflow_run": run}))
            auth.assert_not_called()

    def test_main_cannot_roll_back_newer_publication(self):
        for status in ["behind", "diverged", "identical"]:
            with patch.object(pages, "github_request", return_value={"status":status}):
                self.assertFalse(pages.main_is_newer({"sha":SHA}, {"sha":"b" * 40}))
        with patch.object(pages, "github_request", return_value={"status":"ahead"}):
            self.assertTrue(pages.main_is_newer({"sha":SHA}, {"sha":"b" * 40}))

    def test_artifact_must_match_attempt_and_run(self):
        run = dict(run_id=10, run_attempt=2, sha=SHA, run_started_at="2026-10-08T12:01:00Z")
        artifact = dict(id=20, name="gallery-10-2", expired=False, created_at="2026-10-08T12:02:00Z",
                        workflow_run={"id":10,"head_sha":SHA})
        with patch.object(pages, "github_request", return_value={"artifacts":[artifact]}):
            self.assertEqual(pages.run_artifact(run)["id"], 20)
        with patch.object(pages, "github_request", return_value={"artifacts":[artifact, artifact]}):
            with self.assertRaises(ValueError): pages.run_artifact(run)
        artifact["workflow_run"]["head_sha"] = "b" * 40
        with patch.object(pages, "github_request", return_value={"artifacts":[artifact]}):
            with self.assertRaises(ValueError): pages.run_artifact(run)

    def test_closed_pr_cannot_be_resurrected(self):
        state = {"previews": {"12": {"sha": SHA}}}
        pr = pull(); pr["state"] = "closed"
        with patch.dict(pages.os.environ, {"GITHUB_REPOSITORY": "owner/repo"}), patch.object(pages, "github_request", return_value=pr):
            self.assertEqual(pages.reconcile_previews(state), {12})

    def test_http_error_does_not_delete_preview(self):
        with patch.dict(pages.os.environ, {"GITHUB_REPOSITORY": "owner/repo"}), patch.object(pages, "github_request", side_effect=TimeoutError):
            with self.assertRaises(TimeoutError):
                pages.reconcile_previews({"previews": {"12": {"sha": SHA}}})

    def test_late_status_stays_stale(self):
        pr = pull(); pr["head"]["sha"] = "b" * 40
        body = pages.status_body(pr, {"sha": SHA, "run_id": 10}, "https://example.test/repo/")
        self.assertIn("out of date", body)
        self.assertIn(SHA, body)
        self.assertNotIn("/preview ", body)


if __name__ == "__main__":
    unittest.main()
