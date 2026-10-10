"""Exercise mutations with a real temporary Git store and mocked GitHub transport."""
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.error
import zipfile
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'script'))
import gallery_pages as pages
from test_gallery_pages import SHA, pull


class ControlFlowTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        env = patch.dict(os.environ, {
            'RUNNER_TEMP': tmp.name, 'GITHUB_REPOSITORY': 'owner/repo',
            'GITHUB_REF': 'refs/heads/main', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
            'GALLERY_PAGES_ENABLED': 'true', 'GITHUB_RUN_ID': '123',
            'GITHUB_OUTPUT': str(self.root / 'outputs'), 'GH_TOKEN': 'test-only-token',
            # Tests have their own Git identity/configuration, independent of the developer.
            'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_NOSYSTEM': '1',
        })
        env.start(); self.addCleanup(env.stop)
        remote = self.root / 'remote.git'
        pages.git('init', '--bare', str(remote))
        self.store = pages.Store.__new__(pages.Store)
        self.store.root = self.root / 'store'
        pages.git('init', '-b', 'gh-pages', str(self.store.root))
        pages.git('config', 'user.name', 'Test', cwd=self.store.root)
        pages.git('config', 'user.email', 'test@example.invalid', cwd=self.store.root)
        pages.git('remote', 'add', 'origin', str(remote), cwd=self.store.root)
        self.store.state = pages.site.empty_state('owner/repo')
        self.old = self.store.save('Initial state')
        self.store.state['published_commit'] = self.old
        self.store.save('Confirm initial state')
        self.entry = dict(sha=SHA, run_id=10, run_attempt=1, artifact_id=20, comment_id=7, actor_id=2, layout="gallery")
        self.store.state['previews']['12'] = self.entry.copy()
        preview = self.store.root / 'pr/12/gallery'
        preview.mkdir(parents=True)
        (preview / 'index.html').write_text('<script src="/demo/pr/12/gallery/gallery.a1.js" type="module"></script>')
        (preview / 'preview.html').write_text('<script src="/demo/pr/12/gallery/preview.a1.js" type="module"></script>')
        self.candidate = self.store.save('Prepare candidate')
        factory = patch.object(pages, 'Store', return_value=self.store)
        factory.start(); self.addCleanup(factory.stop)

    def test_failed_deploy_keeps_published_pointer(self):
        with patch.object(pages, 'github_request', return_value=pull()), patch.object(pages, 'update_status'):
            pages.finish('failure', self.candidate, '')
        self.assertEqual(self.store.state['published_commit'], self.old)
        self.assertEqual(self.store.published()[1]['previews'], {})
        self.assertTrue((self.store.root / 'pr/12/gallery/index.html').exists())

    def test_failed_comment_update_preserves_deploy_success_and_can_retry(self):
        with patch.object(pages, 'github_request', return_value=pull()), patch.object(pages, 'update_status', side_effect=TimeoutError):
            with self.assertRaises(TimeoutError):
                pages.finish('success', self.candidate, '55')
        self.assertEqual(self.store.state['published_commit'], self.candidate)
        self.assertEqual(self.store.published()[1]['previews']['12']['sha'], SHA)
        with patch.object(pages, 'github_request', return_value=pull()), patch.object(pages, 'update_status') as status:
            pages.finish('success', self.candidate, '55')
            status.assert_called_once()
        head = pages.git('rev-parse', 'HEAD', cwd=self.store.root)
        with patch.object(pages, 'github_request', return_value=pull()), patch.object(pages, 'update_status'):
            pages.finish('success', self.candidate, '55')
        self.assertEqual(pages.git('rev-parse', 'HEAD', cwd=self.store.root), head)

    def test_failed_confirmation_push_can_retry_from_remote_snapshot(self):
        real_git = pages.git
        def fail_push(*args, **kwargs):
            if args[0] == "push":
                raise pages.subprocess.CalledProcessError(1, ["git", "push"])
            return real_git(*args, **kwargs)
        with patch.object(pages, "git", side_effect=fail_push):
            with self.assertRaises(pages.subprocess.CalledProcessError):
                pages.finish("success", self.candidate, "123/1")
        remote = self.root / "remote.git"
        data = json.loads(real_git("--git-dir", str(remote), "show", "gh-pages:" + pages.site.STATE))
        self.assertEqual(data["published_commit"], self.old)
        fresh = self.root / "fresh"
        real_git("clone", "--branch", "gh-pages", str(remote), str(fresh))
        real_git("config", "user.name", "Test", cwd=fresh)
        real_git("config", "user.email", "test@example.invalid", cwd=fresh)
        self.store.root = fresh
        self.store.state = pages.site.read_state(fresh, "owner/repo")
        with patch.object(pages, "github_request", return_value=pull()), patch.object(pages, "update_status"):
            pages.finish("success", self.candidate, "123/1")
        data = json.loads(real_git("--git-dir", str(remote), "show", "gh-pages:" + pages.site.STATE))
        self.assertEqual(data["published_commit"], self.candidate)

    def test_closed_unconfirmed_deployment_is_removed_even_without_confirmed_preview(self):
        # Pages may already serve this candidate although the confirmation push failed.
        # The confirmed snapshot predates the PR, so cleanup must still publish it.
        closed = pull(); closed["state"] = "closed"
        with patch.dict(os.environ, {"GITHUB_EVENT_NAME": "pull_request_target"}), patch.object(pages, "resolve_build_run", return_value=None), patch.object(pages, "github_request", return_value=closed):
            pages.prepare({"number": 12})
        self.assertIn("deploy=true", (self.root / "outputs").read_text())
        self.assertFalse((self.root / "gallery-pages-public/pr/12").exists())
        self.assertEqual(self.store.state["published_commit"], self.old)

    def test_failed_cleanup_deployment_stays_retryable(self):
        closed = pull(); closed["state"] = "closed"
        with patch.object(pages, "resolve_build_run", return_value=None), patch.object(pages, "github_request", return_value=closed), patch.object(pages, "update_status"):
            pages.prepare({})
            cleanup = pages.git("rev-parse", "HEAD", cwd=self.store.root)
            pages.finish("failure", cleanup, "123/1")
            pages.shutil.rmtree(self.root / "gallery-pages-public")
            (self.root / "outputs").unlink()
            pages.prepare({})
        self.assertIn("deploy=true", (self.root / "outputs").read_text())
        self.assertFalse((self.root / "gallery-pages-public/pr/12").exists())

    def test_skipped_or_failed_same_head_run_does_not_regress_published_status(self):
        self.store.state["published_commit"] = self.candidate
        self.store.save("Confirm published preview")
        for conclusion in ["success", "failure"]:
            with self.subTest(conclusion=conclusion):
                pages.shutil.rmtree(self.root / "gallery-pages-public", ignore_errors=True)
                run = dict(self.entry, target="pr", pr_number=12, conclusion=conclusion, status="completed")
                with patch.dict(os.environ, {"GITHUB_EVENT_NAME":"workflow_run"}), patch.object(pages, "resolve_build_run", return_value=run), patch.object(pages, "github_request", return_value=pull()), patch.object(pages, "run_artifact", return_value=None), patch.object(pages, "update_status") as status:
                    pages.prepare({"workflow_run": {"id":10,"run_attempt":1}})
                    status.assert_not_called()
                pages.shutil.rmtree(self.root / "gallery-pages-public", ignore_errors=True)

    def test_stale_pending_candidate_is_not_reused(self):
        with patch.object(pages, 'resolve_build_run', return_value=None):
            pages.prepare({})
        self.assertIn('deploy=true', (self.root / 'outputs').read_text())
        self.assertFalse((self.root / "gallery-pages-public/pr/12").exists())
        self.assertEqual(self.store.state['published_commit'], self.old)

    def test_early_artifact_cannot_publish_before_all_validation_succeeds(self):
        self.store.state["published_commit"] = self.candidate
        self.store.save("Confirm previous preview")
        current = pull()
        current["head"]["sha"] = "b" * 40
        for state, conclusion in [("in_progress", None), ("completed", "failure"),
                                  ("completed", "cancelled"), ("completed", "timed_out")]:
            with self.subTest(state=state, conclusion=conclusion):
                pages.shutil.rmtree(self.root / "gallery-pages-public", ignore_errors=True)
                (self.root / "outputs").unlink(missing_ok=True)
                run = dict(self.entry, sha=current["head"]["sha"], target="pr", pr_number=12,
                           status=state, conclusion=conclusion)
                with patch.dict(os.environ, {"GITHUB_EVENT_NAME": "workflow_run"}), patch.object(pages, "resolve_build_run", return_value=run), patch.object(pages, "github_request", return_value=current), patch.object(pages, "run_artifact", return_value={"id": 20}) as artifact, patch.object(pages, "download_artifact") as download, patch.object(pages, "update_status"):
                    pages.prepare({"workflow_run": {"id": 10, "run_attempt": 1}})
                artifact.assert_not_called()
                download.assert_not_called()
                self.assertEqual(self.store.state["published_commit"], self.candidate)
                self.assertEqual(self.store.state["previews"]["12"]["sha"], SHA)
                self.assertNotIn("deploy=true", (self.root / "outputs").read_text())

    def test_legacy_pending_candidate_is_discarded_without_relocating_bundle(self):
        self.store.state["previews"]["12"].pop("layout")
        pages.shutil.move(str(self.store.root / "pr/12/gallery/index.html"), self.store.root / "pr/12/index.html")
        pages.shutil.move(str(self.store.root / "pr/12/gallery/preview.html"), self.store.root / "pr/12/preview.html")
        pages.shutil.rmtree(self.store.root / "pr/12/gallery")
        self.store.save("Old layout pending candidate")
        run = dict(self.entry, target="pr", pr_number=12, conclusion="success", status="completed")
        with patch.object(pages, "resolve_build_run", return_value=run), patch.object(pages, "github_request", return_value=pull()):
            pages.prepare({})
        self.assertIn("deploy=true", (self.root / "outputs").read_text())
        self.assertFalse((self.root / "gallery-pages-public/pr/12").exists())
        self.assertEqual(self.store.state["previews"], {})

    def test_main_pending_recovery_reads_gallery_directory_without_nesting_it(self):
        self.store.state["previews"] = {}
        self.store.state["main"] = self.entry.copy()
        gallery = self.store.root / "gallery"; gallery.mkdir()
        (gallery / "index.html").write_text("main candidate")
        (gallery / "preview.html").write_text("main preview")
        (self.store.root / "unrelated.txt").write_text("private root")
        self.store.save("Save namespaced main candidate")
        run = dict(self.entry, target="main", pr_number=None, conclusion="success", status="completed")
        with patch.object(pages, "resolve_build_run", return_value=run):
            pages.prepare({})
        public = self.root / "gallery-pages-public"
        self.assertEqual((public / "gallery/index.html").read_text(), "main candidate")
        self.assertFalse((public / "gallery/gallery").exists())
        self.assertFalse((public / "gallery/unrelated.txt").exists())
        self.assertEqual(self.store.state["main"]["layout"], "gallery")

    def test_legacy_same_head_main_can_be_replaced_by_new_layout_artifact(self):
        self.store.state["previews"] = {}
        self.store.state["main"] = {k: v for k, v in self.entry.items() if k != "layout"}
        (self.store.root / "index.html").write_text("legacy main")
        (self.store.root / "preview.html").write_text("legacy main preview")
        legacy = self.store.save("Prepare legacy main")
        self.store.state["published_commit"] = legacy
        self.store.save("Confirm legacy main")
        run = dict(self.entry, target="main", pr_number=None, conclusion="success", status="completed")
        def download(artifact, archive):
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("index.html", '<script src="/demo/gallery/gallery.a1.js"></script>')
                bundle.writestr("preview.html", '<script src="/demo/gallery/preview.a1.js"></script>')
                bundle.writestr("gallery.a1.js", "module")
                bundle.writestr("preview.a1.js", "module")
        with patch.dict(os.environ, {"GITHUB_EVENT_NAME": "workflow_run"}), patch.object(pages, "resolve_build_run", return_value=run), patch.object(pages, "run_artifact", return_value={"id": 20}), patch.object(pages, "download_artifact", side_effect=download), patch.object(pages, "pages_base", return_value="/demo/"), patch.object(pages, "main_is_newer", side_effect=AssertionError("Same-head migration must not compare history")):
            pages.prepare({"workflow_run": {"id": 10, "run_attempt": 1}})
        self.assertEqual(self.store.state["main"]["layout"], "gallery")
        self.assertTrue((self.root / "gallery-pages-public/gallery/index.html").exists())
        self.assertFalse((self.root / "gallery-pages-public/index.html").exists())

    def test_old_incoming_bundle_is_rejected_and_confirmed_legacy_link_survives(self):
        legacy = {k: v for k, v in self.entry.items() if k != "layout"}
        legacy["sha"] = "b" * 40
        self.store.state["previews"]["12"] = legacy
        pages.shutil.rmtree(self.store.root / "pr/12/gallery")
        (self.store.root / "pr/12/index.html").write_text("legacy preview")
        (self.store.root / "pr/12/preview.html").write_text("legacy frame")
        confirmed = self.store.save("Prepare legacy preview")
        self.store.state["published_commit"] = confirmed
        self.store.save("Confirm legacy preview")
        before = pages.git("rev-parse", "HEAD", cwd=self.store.root)
        run = dict(self.entry, target="pr", pr_number=12, conclusion="success", status="completed")
        def download(artifact, archive):
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("index.html", '<script src="/demo/pr/12/gallery.a1.js"></script>')
                bundle.writestr("preview.html", '<script src="/demo/pr/12/preview.a1.js"></script>')
                bundle.writestr("gallery.a1.js", "module")
                bundle.writestr("preview.a1.js", "module")
        with patch.dict(os.environ, {"GITHUB_EVENT_NAME": "workflow_run"}), patch.object(pages, "resolve_build_run", return_value=run), patch.object(pages, "github_request", return_value=pull()), patch.object(pages, "run_artifact", return_value={"id": 20}), patch.object(pages, "download_artifact", side_effect=download), patch.object(pages, "pages_base", return_value="/demo/"):
            with self.assertRaisesRegex(ValueError, "base path"):
                pages.prepare({"workflow_run": {"id": 10, "run_attempt": 1}})
        self.assertEqual(pages.git("rev-parse", "HEAD", cwd=self.store.root), before)
        self.assertEqual(self.store.state["published_commit"], confirmed)
        self.assertEqual((self.store.root / "pr/12/index.html").read_text(), "legacy preview")
        body = pages.status_body(pull(), legacy, "https://example.test/demo/", "Build failed")
        self.assertIn("[Open previous preview →](https://example.test/demo/pr/12/)", body)
        self.assertNotIn("pr/12/gallery/", body)
        self.assertNotIn("deploy=true", (self.root / "outputs").read_text())

    def test_late_close_removes_namespaced_candidate_before_deployment(self):
        run = dict(self.entry, target="pr", pr_number=12, conclusion="success", status="completed")
        with patch.object(pages, "resolve_build_run", return_value=run), patch.object(pages, "reconcile_previews", side_effect=[set(), {12}]):
            pages.prepare({})
        self.assertEqual(self.store.state["previews"], {})
        self.assertFalse((self.root / "gallery-pages-public/pr/12").exists())
        self.assertIn("deploy=true", (self.root / "outputs").read_text())

    def test_unconfirmed_success_is_safe_to_retry(self):
        run = dict(self.entry, target='pr', pr_number=12, conclusion='success', status='completed')
        with patch.object(pages, 'resolve_build_run', return_value=run), patch.object(pages, 'github_request', return_value=pull()):
            pages.prepare({})
        self.assertIn('deploy=true', (self.root / 'outputs').read_text())
        self.assertEqual(self.store.state['published_commit'], self.old)
        self.assertEqual((self.root / 'gallery-pages-public/pr/12/gallery/index.html').read_text(), '<script src="/demo/pr/12/gallery/gallery.a1.js" type="module"></script>')

    def test_component_links_are_confirmed_with_their_deployment_snapshot(self):
        changes = {"components": [{"id": "address-input", "title": "Address input"}], "shared": True}
        run = dict(self.entry, target="pr", pr_number=12, conclusion="success", status="completed")
        with patch.object(pages, "resolve_build_run", return_value=run), patch.object(pages, "github_request", return_value=pull()), patch.object(pages, "preview_changes", return_value=changes):
            pages.prepare({})
        candidate = pages.git("rev-parse", "HEAD", cwd=self.store.root)
        self.assertEqual(self.store.state["previews"]["12"]["changes"], changes)
        with patch.object(pages, "github_request", return_value=pull()), patch.object(pages, "update_status"):
            pages.finish("failure", candidate, "123/1")
        self.assertEqual(self.store.published()[1]["previews"], {})
        with patch.object(pages, "github_request", return_value=pull()), patch.object(pages, "update_status"):
            pages.finish("success", candidate, "123/2")
        published = self.store.published()[1]["previews"]["12"]
        self.assertEqual(published["changes"], changes)
        body = pages.status_body(pull(), published, "https://example.test/demo/")
        self.assertIn("component=address-input&scenario=default", body)
        self.assertIn("Shared changes", body)

    def test_recovery_preserves_saved_component_links_when_git_is_unavailable(self):
        changes = {"components": [{"id": "address-input", "title": "Address input"}], "shared": False}
        self.store.state["previews"]["12"]["changes"] = changes
        self.store.save("Save prepared preview links")
        run = dict(self.entry, target="pr", pr_number=12, conclusion="success", status="completed")
        with patch.object(pages, "resolve_build_run", return_value=run), patch.object(pages, "github_request", return_value=pull()), patch.object(pages, "preview_changes", return_value=None):
            pages.prepare({})
        self.assertEqual(self.store.state["previews"]["12"]["sha"], SHA)
        self.assertEqual(self.store.state["previews"]["12"].get("changes"), changes)

    def test_head_change_during_composition_is_rejected(self):
        run = dict(self.entry, target='pr', pr_number=12, conclusion='success', status='completed')
        with patch.object(pages, 'resolve_build_run', side_effect=[run, run, None]), patch.object(pages, 'github_request', return_value=pull()):
            with self.assertRaises(ValueError):
                pages.prepare({})
        self.assertEqual(self.store.state['published_commit'], self.old)
        self.assertNotIn('deploy=true', (self.root / 'outputs').read_text())

    def test_deploy_rechecks_approval_after_environment_wait(self):
        with patch.object(pages, "github_request", return_value=pull()), patch.object(pages, "resolve_build_run", return_value=None):
            with self.assertRaises(ValueError):
                pages.verify_deployment(self.candidate)
        self.assertEqual(self.store.state["published_commit"], self.old)

    def test_old_preview_commands_cannot_mutate_deployment_state(self):
        before = pages.git("rev-parse", "HEAD", cwd=self.store.root)
        with patch.dict(os.environ, {"GITHUB_EVENT_NAME": "issue_comment"}):
            pages.prepare({"issue": {"number": 12, "pull_request": {}},
                           "comment": {"body": "/preview " + SHA}})
        self.assertEqual(pages.git("rev-parse", "HEAD", cwd=self.store.root), before)
        self.assertEqual((self.root / "outputs").read_text(), "deploy=false\n")

    def test_download_redirect_drops_authorization(self):
        data = b'archive'
        artifact = {'id': 20, 'digest': 'sha256:' + pages.hashlib.sha256(data).hexdigest()}
        class Opener:
            def open(inner, request, timeout):
                self.assertEqual(request.get_header('Authorization'), 'Bearer test-only-token')
                raise urllib.error.HTTPError(request.full_url, 302, '', {'Location': 'https://storage.example/signed'}, None)
        def download(request, timeout):
            self.assertIsNone(request.get_header('Authorization'))
            return io.BytesIO(data)
        with patch.object(pages.urllib.request, 'build_opener', return_value=Opener()), patch.object(pages.urllib.request, 'urlopen', side_effect=download):
            pages.download_artifact(artifact, self.root / 'artifact.zip')
            artifact['digest'] = 'sha256:' + '0' * 64
            with self.assertRaisesRegex(ValueError, 'digest'):
                pages.download_artifact(artifact, self.root / 'bad.zip')


if __name__ == '__main__':
    unittest.main()
