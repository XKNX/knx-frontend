from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "script"))
import gallery_pages_site as site


class SiteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def archive(self, extra=None):
        path = self.root / "gallery.zip"
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("index.html", "main")
            z.writestr("preview.html", "preview")
            if extra:
                z.writestr(*extra)
        return path

    def test_safe_gallery_extracts(self):
        site.extract_gallery(self.archive(("static/x.js", "hello")), self.root / "out")
        self.assertEqual((self.root / "out/static/x.js").read_text(), "hello")

    def test_traversal_and_links_rejected(self):
        for name in ["../index.html", "/index.html", "a/../../index.html", "a\\x", "x/./b"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                site.extract_gallery(self.archive((name, "bad")), self.root / "out")
        info = zipfile.ZipInfo("link"); info.external_attr = (stat.S_IFLNK | 0o777) << 16
        with self.assertRaises(ValueError):
            site.extract_gallery(self.archive((info, "../bad")), self.root / "out")
        self.assertFalse((self.root / "out").exists())

    def test_duplicate_and_reserved_paths_rejected(self):
        for name in ["INDEX.html", ".git/config", ".github/workflows/x.yml", "CNAME", ".gallery-pages.json", "pr/1/index.html", "a/.gitkeep"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                site.extract_gallery(self.archive((name, "bad")), self.root / "out")

    def test_limits_checked_before_copy(self):
        with patch.object(site, "MAX_GALLERY_BYTES", 8), self.assertRaises(ValueError):
            site.extract_gallery(self.archive(), self.root / "out")
        self.assertFalse((self.root / "out").exists())

    def test_invalid_catalog_cannot_leave_an_extracted_candidate(self):
        with self.assertRaises(ValueError):
            site.extract_gallery(self.archive(("catalog.json", '[{"id":"../outside"}]')),
                                 self.root / "out")
        self.assertFalse((self.root / "out").exists())
        with patch.object(site, "MAX_FILES", 1), self.assertRaises(ValueError):
            site.extract_gallery(self.archive(), self.root / "out")

    def source(self):
        root = self.root / "published"
        for name, text in [("index.html", "main"), ("pr/1/index.html", "one"), ("pr/2/index.html", "two"), (".gallery-pages.json", "private")]:
            path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(text)
        return root

    def test_main_update_preserves_previews(self):
        old = self.source(); candidate = self.root / "candidate"; candidate.mkdir()
        (candidate / "index.html").write_text("new")
        out = self.root / "out"
        site.compose_site(old, out, candidate, None, set(), legacy_main=True)
        self.assertEqual((out / "gallery/index.html").read_text(), "new")
        self.assertEqual((out / "pr/1/index.html").read_text(), "one")
        self.assertFalse((out / ".gallery-pages.json").exists())
        self.assertEqual((old / "index.html").read_text(), "main")
        self.assertFalse((out / "index.html").exists())

    def test_pr_update_preserves_main_and_siblings(self):
        candidate = self.root / "candidate"; candidate.mkdir(); (candidate / "index.html").write_text("new")
        out = self.root / "out"
        site.compose_site(self.source(), out, candidate, 1, set())
        self.assertEqual((out / "index.html").read_text(), "main")
        self.assertEqual((out / "pr/1/gallery/index.html").read_text(), "new")
        self.assertEqual((out / "pr/2/index.html").read_text(), "two")
        self.assertFalse((out / "pr/1/index.html").exists())

    def test_cleanup_is_idempotent(self):
        out = self.root / "out"; out2 = self.root / "out2"
        site.compose_site(self.source(), out, None, None, {1, 99})
        site.compose_site(out, out2, None, None, {1, 99})
        self.assertFalse((out2 / "pr/1").exists())
        self.assertEqual((out2 / "pr/2/index.html").read_text(), "two")

    def test_oversize_does_not_replace_published_site(self):
        old = self.source()
        with patch.object(site, "MAX_SITE_BYTES", 1), self.assertRaises(ValueError):
            site.compose_site(old, self.root / "out", None, None, set())
        self.assertEqual((old / "index.html").read_text(), "main")

    def test_main_namespace_replacement_preserves_unrelated_root_content(self):
        old = self.source()
        (old / "gallery").mkdir()
        (old / "gallery/index.html").write_text("previous")
        (old / "gallery/obsolete.js").write_text("obsolete")
        (old / "company.js").write_text("unrelated")
        candidate = self.root / "candidate"; candidate.mkdir()
        (candidate / "index.html").write_text("new")
        out = self.root / "out"
        site.compose_site(old, out, candidate, None, set())
        self.assertEqual((out / "index.html").read_text(), "main")
        self.assertEqual((out / "company.js").read_text(), "unrelated")
        self.assertEqual((out / "gallery/index.html").read_text(), "new")
        self.assertFalse((out / "gallery/obsolete.js").exists())
        self.assertEqual((out / "pr/1/index.html").read_text(), "one")

    def test_namespaced_pr_replacement_removes_old_bundle_files(self):
        old = self.source()
        (old / "pr/1/gallery").mkdir()
        (old / "pr/1/gallery/obsolete.js").write_text("obsolete")
        candidate = self.root / "candidate"; candidate.mkdir()
        (candidate / "index.html").write_text("new")
        out = self.root / "out"
        site.compose_site(old, out, candidate, 1, set())
        self.assertEqual((out / "pr/1/gallery/index.html").read_text(), "new")
        self.assertFalse((out / "pr/1/gallery/obsolete.js").exists())
        self.assertFalse((out / "pr/1/index.html").exists())

    def test_cleanup_removes_both_legacy_and_namespaced_previews(self):
        old = self.source()
        (old / "pr/2/gallery").mkdir()
        (old / "pr/2/gallery/index.html").write_text("two")
        out = self.root / "out"
        site.compose_site(old, out, None, None, {1, 2})
        self.assertFalse((out / "pr/1").exists())
        self.assertFalse((out / "pr/2").exists())
        self.assertEqual((out / "index.html").read_text(), "main")

    def test_new_layout_rejects_legacy_or_foreign_absolute_script_paths(self):
        root = self.root / "candidate"; root.mkdir()
        (root / "index.html").write_text('<script src="/demo/pr/12/gallery/gallery.123.js"></script>')
        (root / "preview.html").write_text('<script src="/demo/pr/12/preview.123.js"></script>')
        (root / "gallery.123.js").write_text("module")
        (root / "preview.123.js").write_text("module")
        with self.assertRaisesRegex(ValueError, "base path"):
            site.validate_gallery_base(root, "/demo/pr/12/gallery/")
        (root / "preview.html").write_text('<script src="https://foreign.test/demo/pr/12/gallery/preview.123.js"></script>')
        with self.assertRaisesRegex(ValueError, "base path"):
            site.validate_gallery_base(root, "/demo/pr/12/gallery/")

    def test_new_layout_requires_entrypoint_scripts_at_existing_bundle_paths(self):
        root = self.root / "candidate"; root.mkdir()
        for name in ["index", "preview"]:
            (root / f"{name}.html").write_text(f'<script type="module" src="/gallery/{name}.123.js"></script>')
            (root / f"{name}.123.js").write_text("module")
        site.validate_gallery_base(root, "/gallery/")
        (root / "preview.123.js").unlink()
        with self.assertRaisesRegex(ValueError, "base path"):
            site.validate_gallery_base(root, "/gallery/")
        (root / "preview.html").write_text("No script")
        with self.assertRaisesRegex(ValueError, "base path"):
            site.validate_gallery_base(root, "/gallery/")

    def test_state_rejects_untrusted_layout_paths(self):
        state = site.empty_state("owner/repo")
        state["main"] = dict(sha="a" * 40, run_id=1, run_attempt=1, artifact_id=1,
                             actor_id=1, comment_id=None, layout="../outside")
        site.write_state(self.root, state)
        with self.assertRaisesRegex(ValueError, "layout"):
            site.read_state(self.root, "owner/repo")

    def test_state_rejects_foreign_repository(self):
        site.write_state(self.root, site.empty_state("owner/repo"))
        self.assertIsNone(site.read_state(self.root, "owner/repo")["published_commit"])
        with self.assertRaises(ValueError):
            site.read_state(self.root, "other/repo")


if __name__ == "__main__":
    unittest.main()
