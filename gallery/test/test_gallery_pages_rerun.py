"""Native reruns must authorize only the matching GitHub run and PR head."""
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "script"))
import gallery_pages as pages
from test_gallery_pages import SHA, pull, rerun


class NativeRerunTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.output = Path(tmp.name) / "output"
        self.pr = pull()
        self.pr["user"]["login"] = "contributor"
        self.run = rerun()
        self.role = "write"
        self.author_role = "read"
        self.writes = []
        self.runs = [self.run]
        self.artifacts = [{"id": 20, "name": "gallery-10-2", "expired": False,
            "created_at": "2026-10-08T12:02:00Z", "workflow_run": {"id": 10, "head_sha": SHA}}]
        env = patch.dict(os.environ, {"GITHUB_REPOSITORY": "owner/repo",
            "GITHUB_EVENT_NAME": "pull_request", "GITHUB_RUN_ID": "10",
            "GITHUB_RUN_ATTEMPT": "2", "GALLERY_PAGES_ENABLED": "true",
            "GITHUB_OUTPUT": str(self.output)})
        env.start(); self.addCleanup(env.stop)
        transport = patch.object(pages, "github_request", side_effect=self.api)
        transport.start(); self.addCleanup(transport.stop)
        # Old SHA commands must not contribute to native rerun authorization.
        comments = patch.object(pages, "github_pages", return_value=[])
        comments.start(); self.addCleanup(comments.stop)

    def api(self, method, path, body=None):
        if method != "GET":
            self.writes.append((method, path, body))
            return {"id": 7}
        if path.endswith("/pulls/12"): return self.pr
        if path.endswith("/runs/10"): return self.run
        if "/runs/10/artifacts?" in path: return {"artifacts": self.artifacts}
        if path.endswith("/workflows/gallery-build.yml"): return {"id": 4}
        if "/workflows/gallery-build.yml/runs?" in path: return {"workflow_runs": self.runs}
        if path.endswith("/collaborators/contributor/permission"): return {"permission": self.author_role}
        if path.endswith("/collaborators/maintainer/permission"): return {"permission": self.role}
        if path.endswith("/pages"): return {"html_url": "https://example.test/repo/"}
        raise AssertionError(path)

    def gate(self):
        self.output.unlink(missing_ok=True)
        with patch.object(pages, "relevant", return_value=False), patch.object(pages, "published_remote_state", return_value=pages.site.empty_state("owner/repo")):
            pages.gate({"pull_request": pull()})
        return self.output.read_text()

    def test_maintainer_rerun_builds_without_a_sha_comment(self):
        self.assertIn("build=true", self.gate())
        self.assertIn("sha=" + SHA, self.output.read_text())
        self.assertEqual(self.writes, [])
        self.assertIn("base_path=/repo/pr/12/gallery/\n", self.output.read_text())

    def test_same_head_legacy_preview_builds_again_at_new_path(self):
        state = pages.site.empty_state("owner/repo")
        state["previews"]["12"] = {"sha": SHA}
        with patch.object(pages, "published_remote_state", return_value=state):
            pages.gate({"pull_request": pull()})
        self.assertIn("base_path=/repo/pr/12/gallery/\n", self.output.read_text())

    def test_same_head_namespaced_preview_skips_rebuilding(self):
        state = pages.site.empty_state("owner/repo")
        state["previews"]["12"] = {"sha": SHA, "layout": "gallery"}
        with patch.object(pages, "published_remote_state", return_value=state):
            pages.gate({"pull_request": pull()})
        self.assertEqual(self.output.read_text(), "build=false\n")

    def test_new_preview_comment_links_namespaced_component_on_custom_domain(self):
        published = {"sha": SHA, "run_id": 8, "layout": "gallery", "changes": {
            "components": [{"id": "address-input", "title": "Address input"}], "shared": False}}
        body = pages.status_body(self.pr, published, "https://custom.test/")
        self.assertIn("[Open preview →](https://custom.test/pr/12/gallery/)", body)
        self.assertIn("https://custom.test/pr/12/gallery/?component=address-input&scenario=default", body)
        self.assertIn("🟢 Ready", body)

    def test_legacy_ready_preview_retains_original_component_url(self):
        published = {"sha": SHA, "run_id": 8, "changes": {
            "components": [{"id": "address-input", "title": "Address input"}], "shared": False}}
        body = pages.status_body(self.pr, published, "https://example.test/repo/")
        self.assertIn("[Open preview →](https://example.test/repo/pr/12/)", body)
        self.assertIn("https://example.test/repo/pr/12/?component=address-input&scenario=default", body)
        self.assertNotIn("pr/12/gallery/", body)

    def test_publisher_independently_accepts_the_maintainer_rerun(self):
        resolved = pages.resolve_build_run({"workflow_run": {"id": 10, "run_attempt": 2}})
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved["actor_id"], 2)
        self.assertEqual(resolved["sha"], SHA)
        self.assertEqual(resolved["run_attempt"], 2)

    def test_artifact_created_by_the_approved_attempt_is_accepted(self):
        run = pages.resolve_build_run({"workflow_run": {"id": 10, "run_attempt": 2}})
        self.assertEqual(pages.run_artifact(run)["id"], 20)

    def test_earlier_attempt_cannot_preload_the_approved_attempts_artifact_name(self):
        run = pages.resolve_build_run({"workflow_run": {"id": 10, "run_attempt": 2}})
        for timestamp in ["2026-10-08T12:00:00Z", "2026-10-08T12:01:00Z"]:
            with self.subTest(created_at=timestamp):
                self.artifacts[0]["created_at"] = timestamp
                with self.assertRaisesRegex(ValueError, "provenance"):
                    pages.run_artifact(run)

    def test_external_initial_run_and_read_only_rerun_are_denied(self):
        for attempt, role in [(1, "write"), (2, "read"), (2, "triage")]:
            with self.subTest(attempt=attempt, role=role):
                self.run["run_attempt"] = attempt
                self.role = role
                with patch.dict(os.environ, {"GITHUB_RUN_ATTEMPT": str(attempt)}):
                    self.assertNotIn("build=true", self.gate())
                self.assertIsNone(pages.resolve_build_run({"workflow_run": {"id": 10, "run_attempt": attempt}}))

    def test_old_run_cannot_authorize_a_new_pr_head(self):
        self.pr["head"]["sha"] = "b" * 40
        self.assertNotIn("build=true", self.gate())
        self.assertIsNone(pages.resolve_build_run({"workflow_run": {"id": 10, "run_attempt": 2}}))

    def test_a_newer_attempt_cannot_authorize_the_gate_of_an_older_attempt(self):
        self.run["run_attempt"] = 3
        self.assertNotIn("build=true", self.gate())
        self.assertIsNone(pages.resolve_build_run({"workflow_run": {"id": 10, "run_attempt": 2}}))

    def test_missing_triggering_actor_is_denied(self):
        self.run.pop("triggering_actor")
        self.assertNotIn("build=true", self.gate())
        self.assertIsNone(pages.resolve_build_run({"workflow_run": {"id": 10, "run_attempt": 2}}))

    def test_status_only_resolution_cannot_target_closed_or_retargeted_prs(self):
        for field, value in [("state", "closed"), ("base", {"ref": "dev"})]:
            with self.subTest(field=field):
                self.pr = pull()
                self.pr[field] = value
                self.assertIsNone(pages.resolve_build_run(
                    {"workflow_run": {"id": 10, "run_attempt": 2}}, status_only=True))

    def test_permission_revocation_before_publication_is_denied(self):
        self.assertIn("build=true", self.gate())
        self.role = "read"
        self.assertIsNone(pages.resolve_build_run({"workflow_run": {"id": 10, "run_attempt": 2}}))

    def test_maintainer_prs_still_build_automatically(self):
        self.author_role = "write"
        self.run["run_attempt"] = 1
        with patch.dict(os.environ, {"GITHUB_RUN_ATTEMPT": "1"}), patch.object(pages, "relevant", return_value=True), patch.object(pages, "published_remote_state", return_value=pages.site.empty_state("owner/repo")):
            pages.gate({"pull_request": pull()})
        self.assertIn("build=true", self.output.read_text())

    def status(self, published=None):
        class Store:
            state = {"comments": {"12": 7}}
        own = {"id": 7, "user": {"id": 41898282, "type": "Bot"},
               "body": "<!-- knx-gallery-preview -->\nOld status"}
        with patch.object(pages, "github_pages", return_value=[own]):
            pages.update_status(Store(), self.pr, published)
        method, path, data = self.writes[-1]
        self.assertEqual((method, path), ("PATCH", "/repos/owner/repo/issues/comments/7"))
        return data["body"]

    def test_pending_comment_links_the_current_run_and_updates_in_place(self):
        self.run["run_attempt"] = 1
        body = self.status()
        self.assertIn("https://github.com/owner/repo/actions/runs/10", body)
        self.assertIn("Re-run all jobs", body)
        self.assertNotIn("/preview ", body)

    def test_status_cannot_link_a_run_associated_with_another_pr(self):
        self.run["pull_requests"] = [{"number": 99}]
        body = self.status()
        self.assertNotIn("actions/runs/10", body)
        self.assertIn("actions/workflows/gallery-build.yml", body)

    def test_unassociated_fork_run_requires_one_matching_open_pr(self):
        self.run["pull_requests"] = []
        other = {**pull(), "number": 13}
        for related, expected in [([self.pr], "actions/runs/10"),
                                  ([self.pr, other], "actions/workflows/gallery-build.yml")]:
            with self.subTest(prs=len(related)), patch.object(pages, "github_pages", return_value=related):
                build = pages.current_build(self.pr)
            body = pages.status_body(self.pr, None, "https://example.test/repo/", build=build)
            self.assertIn(expected, body)
            if len(related) > 1:
                self.assertNotIn("actions/runs/10", body)

    def test_older_failed_run_cannot_overwrite_a_newer_building_status(self):
        self.run["conclusion"] = "failure"
        self.runs.append({**self.run, "id": 11, "status": "in_progress", "conclusion": None})
        public = self.output.parent / "published"
        public.mkdir()
        store = SimpleNamespace(root=self.output.parent / "store", state=pages.site.empty_state("owner/repo"),
            published=lambda: (public, pages.site.empty_state("owner/repo")), save=lambda message: SHA)
        store.state["comments"]["12"] = 7
        own = {"id": 7, "user": {"id": 41898282, "type": "Bot"}, "body": "<!-- knx-gallery-preview -->\nOld status"}
        with patch.dict(os.environ, {"GITHUB_EVENT_NAME": "workflow_run", "GITHUB_REF": "refs/heads/main",
                                    "RUNNER_TEMP": str(self.output.parent)}), patch.object(pages, "Store", return_value=store), patch.object(pages, "github_pages", return_value=[own]):
            pages.prepare({"workflow_run": {"id": 10, "run_attempt": 2}})
        body = self.writes[-1][2]["body"]
        self.assertIn("actions/runs/11", body)
        self.assertIn("### Gallery preview · 🔵 Building", body)
        self.assertNotIn("Build failed", body)

    def test_failed_new_build_retains_the_published_component_links(self):
        old = "b" * 40
        self.run["conclusion"] = "failure"
        published = {"sha": old, "run_id": 8, "changes": {
            "components": [{"id": "address-input", "title": "Address input"}], "shared": False}}
        body = self.status(published)
        self.assertIn("https://github.com/owner/repo/actions/runs/10", body)
        self.assertIn("out of date", body)
        self.assertIn("component=address-input&scenario=default", body)
        self.assertIn(old, body)
        self.assertNotIn("/preview ", body)


if __name__ == "__main__":
    unittest.main()
