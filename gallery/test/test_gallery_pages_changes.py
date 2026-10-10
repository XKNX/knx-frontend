"""Preview links follow real Git changes and the catalog shipped with that build."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "script"))
import gallery_pages as pages


class PreviewChangesTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.repo = self.root / "repo"
        env = patch.dict(os.environ, {"GITHUB_REPOSITORY": "owner/repo",
            "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"})
        env.start(); self.addCleanup(env.stop)
        pages.git("init", "-b", "main", str(self.repo))
        pages.git("config", "user.name", "Test", cwd=self.repo)
        pages.git("config", "user.email", "test@example.invalid", cwd=self.repo)
        self.write("src/components/input.ts", '@customElement("knx-input")\nclass Input {}')
        self.write("src/views/error.ts", 'customElements.define("knx-not-found", NotFound);')
        self.write("gallery/src/examples/input.ts", 'defineExample({tag: "knx-input"})')
        self.write("src/styles.ts", "shared styles")
        self.write("src/components/removed.ts", '@customElement("knx-removed")')
        self.base = self.commit()
        pages.git("update-ref", "refs/remotes/origin/main", self.base, cwd=self.repo)
        self.catalog = self.root / "catalog"
        self.catalog.mkdir()
        (self.catalog / "catalog.json").write_text(json.dumps([
            {"id": "address-input", "title": "Address input", "covers": ["knx-input"]},
            {"id": "error-page", "title": "Error page", "covers": ["knx-error", "knx-not-found"]},
        ]))

    def write(self, path, text):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def commit(self):
        pages.git("add", "--all", cwd=self.repo)
        pages.git("commit", "-m", "Fixture", cwd=self.repo)
        return pages.git("rev-parse", "HEAD", cwd=self.repo)

    def changes(self, sha):
        real_git = pages.git
        def local_git(*args, **kwargs):
            if "fetch" in args:
                return ""
            return real_git(*args, cwd=self.repo)
        with patch.object(pages, "git", side_effect=local_git):
            return pages.preview_changes({"pr_number": 12, "sha": sha}, self.catalog)

    def test_cumulative_changes_use_coverage_owners_and_deduplicate_examples(self):
        self.write("src/components/input.ts", '@customElement("knx-input")\nclass Input { changed = true; }')
        self.write("gallery/src/examples/input.ts", 'defineExample({tag: "knx-input", disabled: true})')
        self.commit()
        self.write("src/views/error.ts", 'customElements.define("knx-not-found", ChangedNotFound);')
        changes = self.changes(self.commit())
        self.assertEqual(changes, {"components": [
            {"id": "address-input", "title": "Address input"},
            {"id": "error-page", "title": "Error page"}], "shared": False})

    def test_failed_new_build_cannot_advance_links_to_unpublished_changes(self):
        self.write("src/components/input.ts", '@customElement("knx-input")\nclass Input { changed = true; }')
        published = self.commit()
        self.write("src/views/error.ts", 'customElements.define("knx-not-found", NewNotFound);')
        self.commit()
        changes = self.changes(published)
        pr = {"number": 12, "state": "open", "head": {"sha": "b" * 40}}
        body = pages.status_body(pr, {"sha": published, "run_id": 10, "changes": changes},
                                 "https://example.test/demo/", "Build failed.")
        self.assertIn("https://example.test/demo/pr/12/?component=address-input&scenario=default", body)
        self.assertNotIn("component=error-page", body)
        self.assertIn("out of date", body)

    def test_shared_and_deleted_sources_are_marked_without_dead_component_links(self):
        self.write("src/styles.ts", "changed shared styles")
        (self.repo / "src/components/removed.ts").unlink()
        self.write("README.md", "Documentation")
        self.assertEqual(self.changes(self.commit()), {"components": [], "shared": True})

    def test_legacy_preview_without_catalog_keeps_existing_comment_behavior(self):
        (self.catalog / "catalog.json").unlink()
        self.assertIsNone(self.changes(self.base))

    def test_untrusted_catalog_cannot_inject_comment_links_or_mentions(self):
        for entry in [
            {"id": "x)\n@someone", "title": "Input", "covers": ["knx-input"]},
            {"id": "input", "title": "Input", "covers": ["../path"]},
        ]:
            with self.subTest(entry=entry):
                (self.catalog / "catalog.json").write_text(json.dumps([entry]))
                with self.assertRaises(ValueError):
                    self.changes(self.base)
        pr = {"number": 12, "state": "open", "head": {"sha": self.base}}
        body = pages.status_body(pr, {"sha": self.base, "run_id": 10, "changes": {
            "components": [{"id": "input", "title": "[Input](https://evil.test) @someone <img>"}],
            "shared": True}}, "https://example.test/demo/")
        self.assertNotIn("[Input](https://evil.test)", body)
        self.assertNotIn("@someone", body)
        self.assertNotIn("<img>", body)
        self.assertIn("component=input&scenario=default", body)

    def test_custom_catalog_ids_are_encoded_as_query_values(self):
        pr = {"number": 12, "state": "open", "head": {"sha": self.base}}
        body = pages.status_body(pr, {"sha": self.base, "run_id": 10, "changes": {
            "components": [{"id": "Input/example&other=true", "title": "Input"}], "shared": False}},
            "https://example.test/demo/")
        self.assertIn("?component=Input%2Fexample%26other%3Dtrue&scenario=default", body)
        self.assertNotIn("&other=true", body)

    def test_large_component_lists_keep_the_comment_bounded_and_link_the_overview(self):
        pr = {"number": 12, "state": "open", "head": {"sha": self.base}}
        body = pages.status_body(pr, {"sha": self.base, "run_id": 10, "layout": "gallery", "changes": {
            "components": [{"id": f"input-{i}" + "x" * 100, "title": "Input" + "x" * 150}
                           for i in range(600)], "shared": False}}, "https://example.test/demo/")
        self.assertLess(len(body), 60000)
        self.assertIn("more components", body)
        self.assertIn("[Browse all examples](https://example.test/demo/pr/12/gallery/)", body)
        self.assertIn("component=input-0", body)

    def test_catalog_rejects_ambiguous_owners_and_oversized_data(self):
        duplicate = {"id": "input", "title": "Input", "covers": ["knx-input"]}
        for index, catalog in enumerate([[duplicate, duplicate], [duplicate, {**duplicate, "id": "other"}],
                        [{**duplicate, "title": "Input\nNew comment"}], {"id": "input"},
                        [{**duplicate, "title": " " * 70000 + "Input"}],
                        [{**duplicate, "id": " " * 70000 + "input"}]]):
            with self.subTest(index=index):
                (self.catalog / "catalog.json").write_text(json.dumps(catalog))
                with self.assertRaises(ValueError):
                    self.changes(self.base)
        (self.catalog / "catalog.json").write_bytes(b" " * (256 * 1024 + 1))
        with self.assertRaises(ValueError):
            self.changes(self.base)


class StickyCommentTests(unittest.TestCase):
    def test_many_updates_reuse_one_comment_even_on_later_pages(self):
        comments = [dict(id=i, body="Human comment", user=dict(id=i, type="User"))
                    for i in range(1, 302)]
        store = SimpleNamespace(state={"comments": {}})
        writes = []
        def api(method, path, body=None):
            if method == "GET" and "/issues/12/comments?" in path:
                page = int(path.rsplit("page=", 1)[1])
                return comments[(page - 1) * 100:page * 100]
            if method == "GET" and path.endswith("/pages"):
                return {"html_url": "https://example.test/demo/"}
            if method == "POST":
                self.assertEqual(path, "/repos/owner/repo/issues/12/comments")
                comments.append(dict(id=999, body=body["body"], user=dict(id=41898282, type="Bot")))
                writes.append(method)
                return {"id": 999}
            if method == "PATCH":
                self.assertEqual(path, "/repos/owner/repo/issues/comments/999")
                comments[-1]["body"] = body["body"]
                writes.append(method)
                return {"id": 999}
            raise AssertionError((method, path))
        with patch.dict(os.environ, {"GITHUB_REPOSITORY": "owner/repo"}), patch.object(pages, "github_request", side_effect=api):
            pr = {"number": 12, "state": "open", "head": {"sha": "a" * 40}}
            for i in range(300):
                pr["head"]["sha"] = f"{i + 1:040x}"
                published = {"sha": pr["head"]["sha"], "run_id": i + 1, "changes": {
                    "components": [{"id": "input", "title": "Input"}], "shared": False}}
                pages.update_status(store, pr, published)
            pages.update_status(store, pr, published)
            store.state["comments"].clear()
            pages.update_status(store, pr, published)
        self.assertEqual(writes.count("POST"), 1)
        self.assertEqual(writes.count("PATCH"), 299)
        self.assertEqual(store.state["comments"]["12"], 999)
        self.assertIn("component=input&scenario=default", comments[-1]["body"])


if __name__ == "__main__":
    unittest.main()
