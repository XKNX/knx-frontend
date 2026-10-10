"""Main skips only changes proven irrelevant since its confirmed publication."""
import base64
import http.client
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "script"))
import gallery_pages as pages


class MainGateTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.repo = self.root / "repo"
        self.remote = self.root / "remote.git"
        self.output = self.root / "output"
        self.pages_url = "https://example.test/demo/"
        env = patch.dict(os.environ, {"GITHUB_REPOSITORY": "owner/repo",
            "GITHUB_EVENT_NAME": "push", "GALLERY_PAGES_ENABLED": "true",
            "GITHUB_OUTPUT": str(self.output), "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1"})
        env.start(); self.addCleanup(env.stop)
        pages.git("init", "--bare", str(self.remote))
        pages.git("init", "-b", "main", str(self.repo))
        pages.git("config", "user.name", "Test", cwd=self.repo)
        pages.git("config", "user.email", "test@example.invalid", cwd=self.repo)
        pages.git("remote", "add", "origin", str(self.remote), cwd=self.repo)
        self.write("src/component.ts", "initial source")
        self.base = self.commit()
        self.confirmed = pages.site.empty_state("owner/repo")
        self.confirmed["main"] = self.entry(self.base)
        self.desired = pages.site.empty_state("owner/repo")
        self.pointer = "a" * 40
        self.desired["published_commit"] = self.pointer
        original_cwd = Path.cwd()
        os.chdir(self.repo)
        self.addCleanup(os.chdir, original_cwd)
        transport = patch.object(pages, "github_request", side_effect=self.api)
        transport.start(); self.addCleanup(transport.stop)

    @staticmethod
    def entry(sha):
        return dict(sha=sha, run_id=10, run_attempt=1, artifact_id=20,
                    comment_id=None, actor_id=2, layout="gallery")

    def write(self, path, text):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def commit(self, *, stage=True):
        if stage:
            pages.git("add", "--all", cwd=self.repo)
        pages.git("commit", "-m", "Fixture", cwd=self.repo)
        sha = pages.git("rev-parse", "HEAD", cwd=self.repo)
        pages.git("push", "origin", "HEAD:main", cwd=self.repo)
        return sha

    def api(self, method, path, body=None):
        if method == "GET" and path == "/repos/owner/repo/pages":
            return {"html_url": self.pages_url}
        prefix = "/repos/owner/repo/contents/" + pages.site.STATE + "?ref="
        if method == "GET" and path.startswith(prefix):
            ref = path[len(prefix):]
            state = {"gh-pages": self.desired, self.pointer: self.confirmed}[ref]
            return {"content": base64.b64encode(json.dumps(state).encode()).decode()}
        raise AssertionError((method, path, body))

    def gate(self, sha, *, ref="refs/heads/main", before=None):
        self.output.unlink(missing_ok=True)
        pages.gate(dict(after=sha, ref=ref, before=before or self.base))
        return self.output.read_text()

    def assert_build(self, sha):
        self.assertEqual(self.gate(sha),
            f"build=false\nbuild=true\nsha={sha}\npr_number=\nbase_path=/demo/gallery/\n")

    def test_legacy_main_rebuilds_even_when_same_head_is_already_published(self):
        self.confirmed["main"].pop("layout")
        self.assert_build(self.base)

    def test_pages_root_and_project_url_prefixes_build_under_gallery(self):
        for url, expected in [("https://custom.test/", "/gallery/"),
                              ("https://owner.github.io/repo", "/repo/gallery/")]:
            with self.subTest(url=url):
                self.pages_url = url
                self.confirmed["main"] = None
                self.assertIn(f"base_path={expected}\n", self.gate(self.base))

    def test_docs_after_confirmed_source_baseline_skip(self):
        self.write("README.md", "documentation only")
        self.assertEqual(self.gate(self.commit()), "build=false\n")

    def test_docs_skip_after_fetching_baseline_into_shallow_checkout(self):
        self.write("README.md", "documentation only")
        sha = self.commit()
        checkout = self.root / "shallow"
        pages.git("clone", "--depth=1", "--branch=main", self.remote.as_uri(), str(checkout))
        os.chdir(checkout)
        with self.assertRaises(pages.subprocess.CalledProcessError):
            pages.git("cat-file", "-e", self.base + "^{commit}")
        self.assertEqual(self.gate(sha), "build=false\n")

    def test_gallery_authoring_docs_after_confirmed_baseline_skip(self):
        for path in ["gallery/README.md", ".agents/skills/knx-frontend-gallery/SKILL.md",
                     ".github/copilot-instructions.md"]:
            with self.subTest(path=path):
                self.confirmed["main"] = self.entry(pages.git("rev-parse", "HEAD"))
                self.write(path, "authoring documentation only")
                self.assertEqual(self.gate(self.commit()), "build=false\n")

    def test_relocated_gallery_inputs_build(self):
        for path in ["gallery/src/catalog.ts", "gallery/script/gallery.mjs",
                     "gallery/script/gallery_pages.py", "gallery/test/gallery-workflows.test.ts",
                     "gallery/test/playwright.gallery.config.ts", "gallery/vitest.config.ts",
                     "gallery/tsconfig.json"]:
            with self.subTest(path=path):
                self.confirmed["main"] = self.entry(pages.git("rev-parse", "HEAD"))
                self.write(path, "changed Gallery input")
                self.assert_build(self.commit())

    def test_source_change_builds(self):
        self.write("src/component.ts", "changed source")
        self.assert_build(self.commit())

    def test_docs_retry_source_change_since_confirmed_sha(self):
        self.write("src/component.ts", "unpublished source")
        unpublished = self.commit()
        self.desired["main"] = self.entry(unpublished)
        self.write("README.md", "documentation after failed deployment")
        sha = self.commit()
        self.assertIn("build=true\n", self.gate(sha, before=unpublished))

    def test_browser_test_only_change_builds(self):
        for path in ["test/gallery.e2e.ts", "test/gallery-pages.e2e.ts",
                     "test/playwright.gallery.config.ts", "test/playwright.gallery-pages.config.ts",
                     "test/playwright.gallery-thumbnails.config.ts"]:
            with self.subTest(path=path):
                # Compare each browser input independently to its confirmed baseline.
                self.confirmed["main"] = self.entry(pages.git("rev-parse", "HEAD"))
                self.write(path, "browser regression")
                self.assert_build(self.commit())

    def test_dependency_only_change_builds(self):
        self.write("pnpm-lock.yaml", "changed dependency")
        self.assert_build(self.commit())

    def test_submodule_gitlink_change_builds(self):
        pages.git("update-index", "--add", "--cacheinfo",
                  f"160000,{self.base},homeassistant-frontend")
        self.assert_build(self.commit(stage=False))

    def test_missing_published_main_builds(self):
        self.confirmed["main"] = None
        self.write("README.md", "first publication")
        self.assert_build(self.commit())

    def test_missing_baseline_object_builds(self):
        self.confirmed["main"] = self.entry("b" * 40)
        self.write("README.md", "unavailable baseline")
        self.assert_build(self.commit())

    def test_invalid_baseline_sha_builds(self):
        self.confirmed["main"] = self.entry("invalid")
        self.write("README.md", "invalid baseline")
        self.assert_build(self.commit())

    def test_unavailable_published_state_builds(self):
        self.write("README.md", "unavailable published state")
        sha = self.commit()
        for error in [urllib.error.URLError("offline"), TimeoutError(), ValueError("Foreign Pages state"),
                      ConnectionResetError("Connection reset during state response"),
                      http.client.IncompleteRead(b"partial state", 20)]:
            with self.subTest(error=type(error).__name__):
                def unavailable(method, path, body=None):
                    if "/contents/" in path:
                        raise error
                    return self.api(method, path, body)
                with patch.object(pages, "github_request", side_effect=unavailable):
                    self.assert_build(sha)

    def test_git_fetch_failure_builds(self):
        checkout = self.root / "checkout"
        pages.git("clone", "--depth=1", "--branch=main", self.remote.as_uri(), str(checkout))
        self.write("README.md", "fetch cannot prove irrelevant")
        sha = self.commit()
        os.chdir(checkout)
        pages.git("remote", "set-url", "origin", str(self.root / "missing.git"))
        self.assert_build(sha)

    def test_git_diff_failure_builds(self):
        # A valid SHA alone is insufficient: this object is a blob, not a commit.
        self.confirmed["main"] = self.entry(pages.git("rev-parse", "HEAD:src/component.ts"))
        self.write("README.md", "diff cannot prove irrelevant")
        self.assert_build(self.commit())

    def test_same_confirmed_sha_skips(self):
        self.assertEqual(self.gate(self.base), "build=false\n")

    def test_disabled_publication_builds_without_reading_state(self):
        self.write("README.md", "validation with publication disabled")
        sha = self.commit()
        with patch.dict(os.environ, {"GALLERY_PAGES_ENABLED": "false"}), patch.object(
                pages, "github_request", side_effect=AssertionError("No remote state needed")):
            self.assertEqual(self.gate(sha),
                f"build=false\nbuild=true\nsha={sha}\npr_number=\nbase_path=/\n")

    def test_invalid_and_non_main_pushes_skip(self):
        for sha, ref in [("invalid", "refs/heads/main"), (self.base, "refs/heads/other")]:
            with self.subTest(sha=sha, ref=ref):
                self.assertEqual(self.gate(sha, ref=ref), "build=false\n")


class BrowserInputPolicyTests(unittest.TestCase):
    def test_gallery_browser_inputs_are_relevant(self):
        for path in ["test/gallery.e2e.ts", "test/gallery-pages.e2e.ts",
                     "test/playwright.gallery.config.ts", "test/playwright.gallery-pages.config.ts",
                     "test/playwright.gallery-thumbnails.config.ts", "test/playwright.gallery-extra.config.ts"]:
            with self.subTest(path=path):
                self.assertTrue(pages.has_gallery_changes([path]))

    def test_docs_do_not_hide_runtime_changes(self):
        docs = ["gallery/README.md", ".agents/skills/knx-frontend-gallery/SKILL.md"]
        self.assertFalse(pages.has_gallery_changes(docs))
        for path in ["src/styles.ts", "gallery/src/examples/README.md", "gallery/script/README.md",
                     "gallery/test/test_gallery_pages_gate.py", "pnpm-lock.yaml", "homeassistant-frontend"]:
            with self.subTest(path=path):
                self.assertTrue(pages.has_gallery_changes([*docs, path]))

    def test_other_browser_tests_remain_irrelevant(self):
        self.assertFalse(pages.has_gallery_changes([
            "test/other.e2e.ts", "test/playwright.other.config.ts",
            "test/playwright.gallery-extra.config.ts.md"]))


if __name__ == "__main__":
    unittest.main()
