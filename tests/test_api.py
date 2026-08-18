import asyncio
import json
from pathlib import Path

import api


def test_get_version_reads_project_version():
    result = asyncio.run(api.get_version())
    package_json = json.loads(Path("package.json").read_text())
    assert result == {"version": package_json["version"]}


def test_get_version_prefers_env_override(monkeypatch):
    monkeypatch.setenv("APP_VERSION", "test-version")
    result = asyncio.run(api.get_version())
    assert result == {"version": "test-version"}
