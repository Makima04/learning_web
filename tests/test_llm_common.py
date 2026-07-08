import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from server.llm_common import SYS_PROMPT, join_url
except Exception as e:  # pragma: no cover
    pytest.importorskip("server.llm_common", reason=f"llm_common 尚未生成: {e}")


def test_join_url_keeps_existing_v1():
    assert join_url("https://api.openai.com/v1", "/chat/completions") == (
        "https://api.openai.com/v1/chat/completions"
    )


def test_join_url_appends_v1_on_trailing_slash():
    assert join_url("https://api.openai.com/", "/chat/completions") == (
        "https://api.openai.com/v1/chat/completions"
    )


def test_join_url_no_duplicate_v1():
    assert join_url("https://x.com/v1", "/models") == "https://x.com/v1/models"


def test_sys_prompt_is_chinese_translation_prompt():
    assert isinstance(SYS_PROMPT, str) and SYS_PROMPT.strip()
    assert "简体中文" in SYS_PROMPT
