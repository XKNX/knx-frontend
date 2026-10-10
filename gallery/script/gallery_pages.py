#!/usr/bin/env python3
"""Trusted gallery control plane. Standard library only; never run PR code here."""
import argparse
import base64
from datetime import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import hashlib
import http.client
import shutil
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request

import gallery_pages_site as site


def is_maintainer(permission: str) -> bool:
    return permission in {"write", "maintain", "admin"}


def same_head(sha: str, pr: dict) -> bool:
    return bool(re.fullmatch(r"[a-f0-9]{40}", sha)) and sha == pr["head"]["sha"]


def authorize_preview(pr: dict, author_permission: str, run: dict | None = None,
                      triggering_permission: str = "") -> dict | None:
    if pr["state"] != "open" or pr["base"]["ref"] != "main" or pr["head"]["repo"] is None:
        return None
    sha = pr["head"]["sha"]
    if not same_head(sha, pr):
        raise ValueError("Invalid PR head")
    if (run and run["run_attempt"] > 1 and run["event"] == "pull_request"
            and run["head_sha"] == sha and run["head_repository"]["id"] == pr["head"]["repo"]["id"]
            and run.get("triggering_actor") and is_maintainer(triggering_permission)):
        return dict(kind="rerun", sha=sha, comment_id=None, actor_id=run["triggering_actor"]["id"])
    if is_maintainer(author_permission):
        return dict(kind="maintainer", sha=sha, comment_id=None, actor_id=pr["user"]["id"])
    return None


def has_gallery_changes(paths: list[str]) -> bool:
    prefixes = ("src/", "gallery/", "build-scripts/", "script/", ".yarn/",
                ".github/actions/setup/", ".github/workflows/gallery-")
    files = {"homeassistant-frontend", ".gitmodules", "package.json", "yarn.lock", ".yarnrc.yml",
             "pnpm-lock.yaml", "pnpm-workspace.yaml",
             ".nvmrc", "tsconfig.json", ".browserslistrc", "rspack.config.cjs", "gulpfile.js",
             "config.js", "VERSION", "test/gallery-thumbnails.ts", "test/gallery.e2e.ts",
             "test/gallery-pages.e2e.ts"}
    docs = {"gallery/README.md"}
    return any(path not in docs and (path in files or path.startswith(prefixes)
               or re.fullmatch(r"test/playwright\.gallery[^/]*\.config\.ts", path)) for path in paths)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def repository() -> str:
    value = os.environ["GITHUB_REPOSITORY"]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", value):
        raise ValueError("Invalid repository")
    return value


def request(path: str, method="GET", body=None):
    if not path.startswith("/") or path.startswith("//"):
        raise ValueError("Expected GitHub API path")
    return urllib.request.Request("https://api.github.com" + path,
        data=json.dumps(body).encode() if body is not None else None, method=method,
        headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"],
                 "Accept": "application/vnd.github+json", "Content-Type": "application/json",
                 "X-GitHub-Api-Version": "2022-11-28"})


def github_request(method: str, path: str, body: dict | None = None):
    with urllib.request.build_opener(NoRedirect()).open(request(path, method, body), timeout=30) as response:
        data = response.read()
        return json.loads(data) if data else None


def github_pages(path: str) -> list[dict]:
    result = []
    for page in range(1, 1001):
        data = github_request("GET", f"{path}{'&' if '?' in path else '?'}per_page=100&page={page}")
        if not isinstance(data, list):
            raise ValueError("Expected a paginated list")
        result.extend(data)
        if len(data) < 100:
            return result
    raise ValueError("Pagination exceeded safety limit")


def repo_path(path: str) -> str:
    return f"/repos/{repository()}{path}"


def permission(user: dict) -> str:
    login = urllib.parse.quote(user["login"], safe="")
    return github_request("GET", repo_path(f"/collaborators/{login}/permission"))["permission"]


def authorization(pr: dict, run: dict | None = None) -> dict | None:
    actor = (run or {}).get("triggering_actor")
    role = permission(actor) if run and run["run_attempt"] > 1 and actor else ""
    return authorize_preview(pr, permission(pr["user"]), run, role)


def git(*args, cwd=None) -> str:
    return subprocess.check_output(["git", *args], cwd=cwd, text=True, stderr=subprocess.PIPE,
                                   env=git_environment()).strip()


def git_environment() -> dict:
    env = os.environ.copy()
    if "GH_TOKEN" in env:
        credential = base64.b64encode(("x-access-token:" + env["GH_TOKEN"]).encode()).decode()
        env.update(GIT_CONFIG_COUNT="1", GIT_CONFIG_KEY_0="http.https://github.com/.extraheader",
                   GIT_CONFIG_VALUE_0="AUTHORIZATION: basic " + credential)
    return env


class Store:
    """Append-only deployment data; lives only in an ephemeral publisher directory."""
    def __init__(self):
        self.root = Path(tempfile.mkdtemp(prefix="gallery-state-", dir=os.environ["RUNNER_TEMP"]))
        git("init", "-b", "gh-pages", str(self.root))
        git("config", "user.name", "github-actions[bot]", cwd=self.root)
        git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com", cwd=self.root)
        git("config", "core.hooksPath", "/dev/null", cwd=self.root)
        git("remote", "add", "origin", f"https://github.com/{repository()}.git", cwd=self.root)
        if git("ls-remote", "--heads", "origin", "gh-pages", cwd=self.root):
            git("fetch", "--depth=1", "--no-tags", "origin", "gh-pages", cwd=self.root)
            # Do not check out an unrelated branch before checking its ownership marker.
            raw = json.loads(git("show", f"FETCH_HEAD:{site.STATE}", cwd=self.root))
            if raw.get("repository") != repository() or raw.get("schema") != 1:
                raise ValueError("Existing gh-pages branch is not managed by gallery Pages")
            git("checkout", "-B", "gh-pages", "FETCH_HEAD", cwd=self.root)
            self.state = site.read_state(self.root, repository())
        else:
            self.state = site.empty_state(repository())

    def save(self, message: str) -> str:
        site.write_state(self.root, self.state)
        git("add", "--all", cwd=self.root)
        if git("diff", "--cached", "--name-only", cwd=self.root):
            git("commit", "-m", message, cwd=self.root)
            git("push", "origin", "HEAD:refs/heads/gh-pages", cwd=self.root)
        return git("rev-parse", "HEAD", cwd=self.root)

    def snapshot(self, sha: str | None) -> Path:
        root = Path(tempfile.mkdtemp(prefix="gallery-snapshot-", dir=os.environ["RUNNER_TEMP"]))
        if sha is None:
            return root
        if not re.fullmatch("[a-f0-9]{40}", sha):
            raise ValueError("Invalid state snapshot")
        git("fetch", "--depth=1", "--no-tags", "origin", sha, cwd=self.root)
        process = subprocess.Popen(["git", "archive", sha], cwd=self.root, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, env=git_environment())
        try:
            with tarfile.open(fileobj=process.stdout, mode="r|") as archive:
                for member in archive:
                    target = root / member.name
                    if (not target.resolve().is_relative_to(root.resolve()) or member.name.startswith("/")
                            or not (member.isfile() or member.isdir())):
                        raise ValueError("Unsafe state snapshot")
                    if member.isdir():
                        target.mkdir(parents=True, exist_ok=True)
                    else:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with archive.extractfile(member) as inp, target.open("wb") as out:
                            shutil.copyfileobj(inp, out)
            if process.wait() != 0:
                raise ValueError("Unable to read state snapshot")
        finally:
            if process.poll() is None:
                process.kill()
            process.communicate()
        return root

    def published(self) -> tuple[Path, dict]:
        root = self.snapshot(self.state["published_commit"])
        data = site.read_state(root, repository()) if (root / site.STATE).exists() else site.empty_state(repository())
        return root, data

    def replace_files(self, public: Path):
        for path in self.root.iterdir():
            if path.name in {".git", site.STATE}:
                continue
            shutil.rmtree(path) if path.is_dir() else path.unlink()
        shutil.copytree(public, self.root, dirs_exist_ok=True)


def output(**values):
    with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
        for key, value in values.items():
            text = str(value).lower() if isinstance(value, bool) else str(value)
            if "\n" in text or "\r" in text:
                raise ValueError("Multiline workflow output")
            stream.write(f"{key}={text}\n")


def relevant(pr: dict, old_sha: str | None = None) -> bool:
    # Only Git objects are read. Disable hooks and recursive submodule fetching.
    number = int(pr["number"])
    try:
        git("-c", "core.hooksPath=/dev/null", "fetch", "--no-recurse-submodules", "origin",
            f"refs/pull/{number}/head", "main")
        head = pr["head"]["sha"]
        base = old_sha or git("merge-base", head, "origin/main")
        paths = git("diff", "--name-only", "--no-renames", "-z", base, head).split("\0")
        return has_gallery_changes(paths)
    except subprocess.CalledProcessError:
        return True


def relevant_main(sha: str, old_sha: str) -> bool:
    if not re.fullmatch("[a-f0-9]{40}", old_sha):
        return True
    if sha == old_sha:
        return False
    try:
        git("-c", "core.hooksPath=/dev/null", "fetch", "--no-recurse-submodules", "--no-tags",
            "origin", old_sha, sha)
        paths = git("diff", "--name-only", "--no-renames", "-z", old_sha, sha).split("\0")
        return has_gallery_changes(paths)
    except (subprocess.CalledProcessError, OSError):
        return True


def pages_base() -> str:
    url = github_request("GET", repo_path("/pages"))["html_url"]
    path = urllib.parse.urlsplit(url).path
    return path if path.endswith("/") else path + "/"


def resolve_build_run(event: dict, *, status_only=False) -> dict | None:
    notice = event["workflow_run"]
    run = github_request("GET", repo_path(f"/actions/runs/{int(notice['id'])}"))
    workflow = github_request("GET", repo_path("/actions/workflows/gallery-build.yml"))
    if (run["workflow_id"] != workflow["id"] or run["run_attempt"] != notice["run_attempt"]
            or run["repository"]["full_name"].lower() != repository().lower()
            or run["event"] not in {"push", "pull_request"}
            or not re.fullmatch("[a-f0-9]{40}", run["head_sha"])):
        return None
    result = dict(sha=run["head_sha"], run_id=run["id"], run_attempt=run["run_attempt"],
                  artifact_id=0, comment_id=None, actor_id=run["actor"]["id"],
                  conclusion=run["conclusion"], status=run["status"], run_started_at=run["run_started_at"])
    if run["event"] == "push":
        if (run["head_branch"] != "main" or run["head_repository"]["id"] != run["repository"]["id"]):
            return None
        return dict(result, target="main", pr_number=None)
    related = run["pull_requests"] or github_pages(repo_path("/pulls?state=open&base=main"))
    matches = []
    for item in related:
        pr = github_request("GET", repo_path(f"/pulls/{int(item['number'])}"))
        if (pr["state"] == "open" and pr["base"]["ref"] == "main"
                and same_head(run["head_sha"], pr) and pr["head"]["repo"] is not None
                and pr["head"]["repo"]["id"] == run["head_repository"]["id"]):
            # Unapproved runs may update their PR's status, never supply a candidate.
            auth = authorization(pr, run) if not status_only else None
            if auth or status_only:
                matches.append(dict(result, target="pr", pr_number=pr["number"],
                                    comment_id=None, actor_id=auth["actor_id"] if auth else run["actor"]["id"],
                                    authorization_kind=auth["kind"] if auth else None))
    return matches[0] if len(matches) == 1 else None


def run_artifact(run: dict) -> dict | None:
    name = f"gallery-{run['run_id']}-{run['run_attempt']}"
    matches = []
    for page in range(1, 1001):
        data = github_request("GET", repo_path(f"/actions/runs/{run['run_id']}/artifacts?per_page=100&page={page}"))["artifacts"]
        matches.extend(item for item in data if item["name"] == name and not item["expired"])
        if len(data) < 100:
            break
    else:
        raise ValueError("Too many artifacts")
    if len(matches) > 1:
        raise ValueError("Ambiguous build artifact")
    # PR code controls artifact names. GitHub's timestamps must also place the
    # upload after this attempt began. Reject equal timestamps (one-second API
    # precision); a real Gallery build takes longer than the start second.
    if matches and (matches[0]["workflow_run"]["id"] != run["run_id"]
                    or matches[0]["workflow_run"]["head_sha"] != run["sha"]
                    or datetime.fromisoformat(matches[0]["created_at"]) <=
                       datetime.fromisoformat(run["run_started_at"])):
        raise ValueError("Artifact provenance mismatch")
    return matches[0] if matches else None


def download_artifact(artifact: dict, destination: Path):
    try:
        urllib.request.build_opener(NoRedirect()).open(
            request(repo_path(f"/actions/artifacts/{int(artifact['id'])}/zip")), timeout=30)
    except urllib.error.HTTPError as error:
        if error.code != 302:
            raise
        url = error.headers["Location"]
    else:
        raise ValueError("Expected signed artifact redirect")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Unsafe artifact redirect")
    digest = hashlib.sha256()
    count = 0
    # A separate request carries no repository credentials, including on redirects.
    with urllib.request.urlopen(urllib.request.Request(url), timeout=60) as response, destination.open("xb") as out:
        while chunk := response.read(1024 * 1024):
            count += len(chunk)
            if count > 256 * 1024 * 1024:
                raise ValueError("Compressed artifact exceeds limit")
            digest.update(chunk)
            out.write(chunk)
    if artifact.get("digest") != "sha256:" + digest.hexdigest():
        raise ValueError("Artifact digest mismatch")


def reconcile_previews(state: dict) -> set[int]:
    removed = set()
    for number in state["previews"]:
        pr = github_request("GET", repo_path(f"/pulls/{int(number)}"))
        if pr["state"] == "closed" or pr["head"]["repo"] is None or pr["base"]["ref"] != "main":
            removed.add(int(number))
    return removed


def preview_changes(run: dict, candidate: Path) -> dict | None:
    catalog = site.read_catalog(candidate)
    if catalog is None:
        return None
    sha = run["sha"]
    if not re.fullmatch("[a-f0-9]{40}", sha) or int(run["pr_number"]) <= 0:
        raise ValueError("Invalid preview revision")
    # Read Git objects only. The privileged publisher never imports or runs PR code.
    try:
        git("-c", "core.hooksPath=/dev/null", "fetch", "--no-recurse-submodules", "origin",
            f"refs/pull/{int(run['pr_number'])}/head", "main")
        base = git("merge-base", sha, "origin/main")
        paths = git("diff", "--name-only", "--no-renames", "-z", base, sha).split("\0")
    except subprocess.CalledProcessError:
        return None  # An unavailable historical revision must not block publication.
    owners = {tag: entry for entry in catalog for tag in entry["covers"]}
    selected = {}
    shared = False
    for path in paths:
        if not has_gallery_changes([path]) or re.search(r"\.(?:test|spec)\.", path):
            continue
        tags = []
        if path.endswith(".ts") and (path.startswith("src/") or path.startswith("gallery/src/examples/")):
            try:
                source = git("show", f"{sha}:{path}")
            except subprocess.CalledProcessError:
                source = ""  # Deleted components have no live example to link to.
            pattern = (r'\btag\s*:\s*["\']([^"\']+)["\']' if path.startswith("gallery/") else
                       r'(?:@customElement|customElements\.define)\s*\(\s*["\']([^"\']+)["\']')
            tags = re.findall(pattern, source)
        if not tags or any(tag not in owners for tag in tags):
            shared = True
        for tag in tags:
            if tag in owners:
                entry = owners[tag]
                selected[entry["id"]] = {"id": entry["id"], "title": entry["title"]}
    return {"components": sorted(selected.values(), key=lambda entry: entry["id"]), "shared": shared}


def current_build(pr: dict) -> dict | None:
    data = github_request("GET", repo_path("/actions/workflows/gallery-build.yml/runs?event=pull_request&head_sha="
                                           + pr["head"]["sha"] + "&per_page=100"))
    runs = [run for run in data["workflow_runs"] if run["event"] == "pull_request"
            and run["head_sha"] == pr["head"]["sha"] and run.get("head_repository")
            and run["head_repository"]["id"] == pr["head"]["repo"]["id"]
            and (not run["pull_requests"] or any(item["number"] == pr["number"] for item in run["pull_requests"]))]
    if any(not run["pull_requests"] for run in runs):
        related = github_pages(repo_path("/pulls?state=open&base=main"))
        matching = [item["number"] for item in related if item["state"] == "open"
                    and item["base"]["ref"] == "main" and same_head(pr["head"]["sha"], item)
                    and item["head"]["repo"] is not None
                    and item["head"]["repo"]["id"] == pr["head"]["repo"]["id"]]
        if matching != [pr["number"]]:
            runs = [run for run in runs if run["pull_requests"]]
    return max(runs, key=lambda run: (run.get("run_started_at", ""), run["id"], run["run_attempt"])) if runs else None


def status_body(pr: dict, published: dict | None, url: str, phase: str = "", *,
                build: dict | None = None, approved=False) -> str:
    ready = published is not None and published["sha"] == pr["head"]["sha"]
    if pr["state"] == "closed":
        label = "Preview cleanup pending" if published or phase else "Preview removed"
    elif ready:
        label = "Ready"
    elif phase:
        label = phase.removesuffix(".")
    elif not approved:
        label = "Awaiting maintainer approval"
    elif build and build["status"] != "completed":
        label = "Building"
    elif build and build["conclusion"] != "success":
        label = "Build failed"
    else:
        label = "Publishing" if build else "Waiting for Gallery build"
    icon, explanation = {
        "Ready": ("🟢", "This preview matches the latest commit in this pull request."),
        "Awaiting maintainer approval": ("🟡", "This pull request cannot publish a preview automatically. A maintainer can start the build."),
        "Building": ("🔵", "The latest commit is being built. This comment will update when the preview is published."),
        "Publishing": ("🔵", "The build is complete. The preview is being published."),
        "Waiting for Gallery build": ("🟡", "Waiting for a Gallery build for the latest commit."),
        "Build skipped": ("🟡", "The automatic build was skipped. A maintainer can build this commit manually."),
        "Build failed": ("🔴", "The latest commit could not be built. Check the build log before trying again."),
        "Deployment failed": ("🔴", "The build completed, but the preview could not be published."),
        "Preview cleanup pending": ("⚪", "This pull request is closed. Its preview will be removed by the next successful deployment."),
        "Preview removed": ("⚪", "This pull request is closed and its preview has been removed."),
    }[label]
    body = f"<!-- knx-gallery-preview -->\n### Gallery preview · {icon} {label}\n\n{explanation}\n\n"
    build_url = f"https://github.com/{repository()}/actions/runs/{build['id']}" if build else None
    pending = pr["state"] == "open" and not ready
    rerunnable = pending and build and (not approved or label in {"Build failed", "Build skipped", "Deployment failed"})
    if pending:
        if rerunnable:
            body += f"**[Open Gallery build →]({build_url})** · Select **Re-run all jobs** to build and publish this commit.\n\n"
        elif build_url:
            body += f"[View build →]({build_url})\n\n"
        else:
            body += f"[Open Gallery workflow →](https://github.com/{repository()}/actions/workflows/gallery-build.yml)\n\n"
    if published:
        stale = published["sha"] != pr["head"]["sha"]
        suffix = "gallery/" if published.get("layout") == "gallery" else ""
        preview_url = f"{url.rstrip('/')}/pr/{pr['number']}/{suffix}"
        if stale:
            body += f"**[Open previous preview →]({preview_url})** · This preview is out of date and shows an earlier commit.\n\n"
        else:
            body += f"**[Open preview →]({preview_url})** · [View build](https://github.com/{repository()}/actions/runs/{published['run_id']})\n\n"
        changes = published.get("changes")
        if changes is not None:
            site.validate_preview_changes(changes)
        if changes and (changes["components"] or changes["shared"]):
            heading = "Components in the previous preview" if stale else "Changed components"
            body += f"**{heading} · {len(changes['components'])}**\n\n" if changes["components"] else "**Shared Gallery changes**\n\n"
            link_length = 0
            for index, entry in enumerate(changes["components"]):
                # Treat catalog titles as untrusted text, including Markdown and mentions.
                title = re.sub(r"([\\`*_{}\[\]()<>#!|~])", r"\\\1", entry["title"]).replace("@", "@\u200b")
                query = urllib.parse.urlencode({"component": entry["id"], "scenario": "default"})
                link = f"- [{title}]({preview_url}?{query})\n"
                # ponytail: cap link text at 20,000 characters; large PRs use the overview.
                if link_length + len(link) > 20_000:
                    remaining = len(changes["components"]) - index
                    body += f"\n{remaining} more components. [Browse all examples]({preview_url}).\n"
                    break
                body += link
                link_length += len(link)
            if changes["shared"]:
                body += "\nShared changes to styles, helpers, fixtures or build inputs may affect multiple examples.\n"
            body += "\n"
    body += "<details>\n<summary>Build details</summary>\n\n"
    sha = pr["head"]["sha"]
    body += f"Current commit: [{sha[:7]}](https://github.com/{repository()}/commit/{sha}).\n\n"
    if published:
        body += f"Published commit: [{published['sha'][:7]}](https://github.com/{repository()}/commit/{published['sha']}). "
        body += f"[Published build](https://github.com/{repository()}/actions/runs/{published['run_id']}).\n\n"
        body += "Component links refer to this published preview and its changes relative to main.\n\n"
    if rerunnable:
        if not approved:
            body += "Each new commit needs a new maintainer run.\n\n"
        body += "If the run no longer allows a re-run, edit the PR description to create a fresh run.\n\n"
    elif pending and not build:
        body += "Approve the fork workflow in Actions if GitHub requests it.\n\n"
    body += "</details>\n"
    return body


def update_status(store: Store, pr: dict, published: dict | None, phase="", *, phase_run=None):
    number = str(pr["number"])
    comments = github_pages(repo_path(f"/issues/{number}/comments"))
    own = [c for c in comments if c["user"]["id"] == 41898282 and c["user"]["type"] == "Bot"
           and c["body"].startswith("<!-- knx-gallery-preview -->")]
    identifier = store.state["comments"].get(number)
    if identifier:
        own = [c for c in own if c["id"] == identifier]
        if not own:
            raise ValueError("Recorded preview comment is missing or no longer owned by the bot")
    if len(own) > 1:
        raise ValueError("Ambiguous preview status comments")
    url = github_request("GET", repo_path("/pages"))["html_url"]
    pending = pr["state"] == "open" and (published is None or published["sha"] != pr["head"]["sha"])
    build = current_build(pr) if pending and pr["head"]["repo"] else None
    approved = authorization(pr, build) is not None if pending else False
    if phase_run and (build is None or (build["id"], build["run_attempt"]) !=
                      (phase_run["run_id"], phase_run["run_attempt"])):
        phase = ""
    body = status_body(pr, published, url, phase, build=build, approved=approved)
    if own:
        if own[0]["body"] != body:
            github_request("PATCH", repo_path(f"/issues/comments/{own[0]['id']}"), {"body": body})
        identifier = own[0]["id"]
    else:
        identifier = github_request("POST", repo_path(f"/issues/{number}/comments"), {"body": body})["id"]
    store.state["comments"][number] = identifier


def published_remote_state() -> dict:
    def read(ref):
        data = github_request("GET", repo_path("/contents/" + site.STATE + "?ref=" + ref))
        state = json.loads(base64.b64decode(data["content"]))
        if state["schema"] != 1 or state["repository"] != repository():
            raise ValueError("Foreign Pages state")
        return state
    try:
        desired = read("gh-pages")
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        return site.empty_state(repository())
    pointer = desired["published_commit"]
    if pointer is None:
        return site.empty_state(repository())
    if not re.fullmatch("[a-f0-9]{40}", pointer):
        raise ValueError("Invalid published pointer")
    return read(pointer)


def main_is_newer(candidate: dict, published: dict | None) -> bool:
    if published is None:
        return True
    comparison = github_request("GET", repo_path(f"/compare/{published['sha']}...{candidate['sha']}"))
    return comparison["status"] == "ahead"


def entry_for(run: dict) -> dict:
    return dict({key: run[key] for key in ["sha", "run_id", "run_attempt", "artifact_id", "comment_id", "actor_id"]},
                layout="gallery")


def prepare(event: dict):
    output(deploy=False)
    if os.environ.get("GALLERY_PAGES_ENABLED") != "true":
        return
    name = os.environ["GITHUB_EVENT_NAME"]
    if os.environ["GITHUB_REF"] != "refs/heads/main":
        raise ValueError("Publisher must run from main")
    if name not in {"pull_request_target", "workflow_run", "workflow_dispatch"}:
        return
    store = Store()
    public, confirmed = store.published()
    if name == "pull_request_target":
        pr = github_request("GET", repo_path(f"/pulls/{int(event['number'])}"))
        number = str(pr["number"])
        if pr["state"] == "open" and (number in store.state["comments"] or relevant(pr)):
            update_status(store, pr, confirmed["previews"].get(number))
            store.save("Update gallery preview status")
        if pr["state"] == "open":
            return

    incoming = None
    if name == "workflow_run":
        incoming = resolve_build_run(event)
        status_run = incoming or resolve_build_run(event, status_only=True)
        if status_run and status_run["target"] == "pr" and (incoming is None or status_run["status"] != "completed"):
            number = str(status_run["pr_number"])
            pr = github_request("GET", repo_path(f"/pulls/{number}"))
            update_status(store, pr, confirmed["previews"].get(number))
            store.save("Update gallery build status")
            return
        if incoming and incoming["target"] == "pr":
            number = str(incoming["pr_number"])
            pr = github_request("GET", repo_path(f"/pulls/{number}"))
            artifact = run_artifact(incoming) if incoming["conclusion"] == "success" else None
            if artifact is None and confirmed["previews"].get(number, {}).get("sha") != incoming["sha"]:
                phase = "Build skipped" if incoming["conclusion"] == "success" else "Build failed"
                update_status(store, pr, confirmed["previews"].get(number), phase, phase_run=incoming)
                store.save("Record gallery build result")
            if artifact is None:
                incoming = None
        if incoming and incoming["conclusion"] != "success":
            incoming = None

    state = store.state
    # Recover a prepared-but-unconfirmed snapshot without rebuilding, after reauthorization.
    candidates = []
    for number, entry in [(None, state["main"]), *state["previews"].items()]:
        previous = confirmed["main"] if number is None else confirmed["previews"].get(number)
        if entry is None or entry == previous or entry.get("layout") != "gallery":
            continue  # Legacy pending bundles cannot be relocated: rebuild them.
        recovered = resolve_build_run({"workflow_run": {"id": entry["run_id"], "run_attempt": entry["run_attempt"]}})
        if recovered and recovered["conclusion"] == "success" and recovered["sha"] == entry["sha"]:
            recovered["artifact_id"] = entry["artifact_id"]
            recovered["changes"] = entry.get("changes")
            candidates.append((recovered, store.root / site.gallery_path(int(number) if number else None)))
    if incoming:
        artifact = run_artifact(incoming)
        if artifact:
            incoming["artifact_id"] = artifact["id"]
            archive = Path(os.environ["RUNNER_TEMP"]) / f"gallery-{artifact['id']}.zip"
            download_artifact(artifact, archive)
            candidate = archive.with_suffix("")
            site.extract_gallery(archive, candidate)
            target = site.gallery_path(incoming["pr_number"]).as_posix()
            site.validate_gallery_base(candidate, pages_base() + target + "/")
            candidates.append((incoming, candidate))

    # A successful Pages upload may have outlived a failed confirmation push.
    # Discarding any pending content must therefore publish the safe snapshot.
    pending = state["deployment_pending"] or state["main"] != confirmed["main"] or state["previews"] != confirmed["previews"]
    state["main"] = confirmed["main"]
    state["previews"] = dict(confirmed["previews"])
    removed = reconcile_previews(state)
    for number in removed:
        state["previews"].pop(str(number), None)
        state["requests"].pop(str(number), None)
    changed = pending or bool(removed)
    output_root = Path(os.environ["RUNNER_TEMP"]) / "gallery-pages-public"
    site.compose_site(public, output_root, None, None, removed)
    adopted = []
    for run, candidate in candidates:
        # Recheck the exact SHA immediately before adopting the candidate.
        fresh = resolve_build_run({"workflow_run": {"id": run["run_id"], "run_attempt": run["run_attempt"]}})
        if fresh is None or fresh["sha"] != run["sha"]:
            continue
        number = run["pr_number"]
        previous = state["main"] if number is None else state["previews"].get(str(number))
        migrating = previous and previous["sha"] == run["sha"] and previous.get("layout") != "gallery"
        if number is None:
            if not migrating and not main_is_newer(run, previous):
                continue
        elif previous and previous["sha"] == run["sha"] and not migrating:
            continue
        next_root = Path(tempfile.mkdtemp(dir=os.environ["RUNNER_TEMP"])) / "site"
        site.compose_site(output_root, next_root, candidate, number, set(),
                          legacy_main=number is None and previous is not None and previous.get("layout") != "gallery")
        shutil.rmtree(output_root)
        shutil.move(str(next_root), output_root)
        if number is None:
            state["main"] = entry_for(run)
        else:
            entry = entry_for(run)
            changes = run.get("changes")
            if changes is None:
                changes = preview_changes(run, candidate)
            if changes is not None:
                entry["changes"] = changes
            state["previews"][str(number)] = entry
            state["requests"].pop(str(number), None)
        adopted.append(run)
        changed = True
    # Closing during download/extraction must also win.
    late_removed = reconcile_previews(state)
    for number in late_removed:
        shutil.rmtree(output_root / "pr" / str(number), ignore_errors=True)
        state["previews"].pop(str(number), None)
    changed = changed or bool(late_removed)
    if not changed:
        return
    for run in adopted:
        if run["pr_number"] in late_removed:
            continue
        fresh = resolve_build_run({"workflow_run": {"id": run["run_id"], "run_attempt": run["run_attempt"]}})
        if fresh is None or fresh["sha"] != run["sha"]:
            raise ValueError("Candidate authorization changed during preparation; retry reconciliation")
    site.validate_site_size(output_root)
    store.replace_files(output_root)
    state["deployment_pending"] = True
    commit = store.save("Prepare gallery Pages deployment")
    output(deploy=True, state_commit=commit, artifact_name=f"github-pages-{os.environ['GITHUB_RUN_ID']}-{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}")


def verify_deployment(state_commit: str):
    """Run after environment approval, immediately before the Pages action."""
    if os.environ.get("GALLERY_PAGES_ENABLED") != "true" or os.environ["GITHUB_REF"] != "refs/heads/main":
        raise ValueError("Publisher is not enabled on main")
    store = Store()
    if not re.fullmatch("[a-f0-9]{40}", state_commit) or git("rev-parse", "HEAD", cwd=store.root) != state_commit:
        raise ValueError("Deployment snapshot changed")
    if reconcile_previews(store.state):
        raise ValueError("A preview closed while waiting for deployment; run reconciliation")
    _, confirmed = store.published()
    for number, entry in [(None, store.state["main"]), *store.state["previews"].items()]:
        previous = confirmed["main"] if number is None else confirmed["previews"].get(number)
        if entry is None or entry == previous:
            continue
        fresh = resolve_build_run({"workflow_run": {"id": entry["run_id"], "run_attempt": entry["run_attempt"]}})
        if fresh is None or fresh["sha"] != entry["sha"] or fresh["conclusion"] != "success":
            raise ValueError("Deployment approval changed; run reconciliation")


def finish(result: str, state_commit: str, deployment_run: str):
    if os.environ.get("GALLERY_PAGES_ENABLED") != "true" or os.environ["GITHUB_REF"] != "refs/heads/main":
        raise ValueError("Publisher is not enabled on main")
    store = Store()
    if not re.fullmatch("[a-f0-9]{40}", state_commit):
        raise ValueError("Invalid deployment snapshot")
    already_confirmed = store.state["published_commit"] == state_commit
    if not already_confirmed and git("rev-parse", "HEAD", cwd=store.root) != state_commit:
        raise ValueError("Deployment state changed unexpectedly")
    if result == "success" and not already_confirmed:
        if not deployment_run:
            raise ValueError("Missing successful deployment run")
        store.state["published_commit"] = state_commit
        store.state["deployment_run"] = deployment_run
        store.state["deployment_pending"] = False
        store.save("Confirm gallery Pages deployment")
    _, confirmed = store.published()
    # Commit confirmation before comments: a comment error cannot erase deploy success.
    for number in set(store.state["comments"]) | set(store.state["previews"]):
        pr = github_request("GET", repo_path(f"/pulls/{int(number)}"))
        phase = "" if result == "success" else "Deployment failed"
        update_status(store, pr, confirmed["previews"].get(number), phase,
                      phase_run=store.state["previews"].get(number) if phase else None)
    store.save("Update deployed gallery preview links")


def gate(event: dict):
    output(build=False)
    enabled = os.environ.get("GALLERY_PAGES_ENABLED") == "true"
    base = pages_base() if enabled else "/"
    if os.environ["GITHUB_EVENT_NAME"] == "push":
        sha = event["after"]
        if event["ref"] != "refs/heads/main" or not re.fullmatch("[a-f0-9]{40}", sha):
            return
        if enabled:
            try:
                previous = published_remote_state()["main"]
            except (OSError, http.client.HTTPException, ValueError, KeyError, TypeError):
                previous = None
            old_sha = previous.get("sha") if isinstance(previous, dict) else None
            if (isinstance(old_sha, str) and previous.get("layout") == "gallery"
                    and not relevant_main(sha, old_sha)):
                return
        output(build=True, sha=sha, pr_number="", base_path=base + "gallery/" if enabled else "/")
        return
    original = event["pull_request"]
    pr = github_request("GET", repo_path(f"/pulls/{int(original['number'])}"))
    if not same_head(original["head"]["sha"], pr):
        return
    run = resolve_build_run({"workflow_run": {"id": int(os.environ["GITHUB_RUN_ID"]),
                                              "run_attempt": int(os.environ["GITHUB_RUN_ATTEMPT"])}})
    if run is None or run["target"] != "pr" or run["pr_number"] != pr["number"] or run["sha"] != original["head"]["sha"]:
        return
    previous = published_remote_state()["previews"].get(str(pr["number"])) if enabled else None
    if previous and previous["sha"] == run["sha"] and previous.get("layout") == "gallery":
        return
    if (run["authorization_kind"] != "rerun" and not (previous and previous.get("layout") != "gallery")
            and not relevant(pr, previous["sha"] if previous else None)):
        return
    output(build=True, sha=run["sha"], pr_number=pr["number"], base_path=f"{base}pr/{pr['number']}/gallery/" if enabled else "/")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["gate", "prepare", "verify", "finish"])
    parser.add_argument("--result", default="failure")
    parser.add_argument("--state-commit", default="")
    parser.add_argument("--deployment-run", default="")
    args = parser.parse_args()
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    if args.command == "gate":
        gate(event)
    elif args.command == "prepare":
        prepare(event)
    elif args.command == "verify":
        verify_deployment(args.state_commit)
    else:
        finish(args.result, args.state_commit, args.deployment_run)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not log signed download URLs, credentials, or untrusted response bodies.
        detail = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(f"Gallery Pages failed: {detail}", flush=True)
        raise SystemExit(1) from None
