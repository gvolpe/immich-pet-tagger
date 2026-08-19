import embedder


def test_clip_force_quick_gelu_for_openai_weights():
    assert embedder._clip_force_quick_gelu("ViT-L-14", "openai")
    assert embedder._clip_force_quick_gelu("ViT-B-16", "OPENAI")


def test_clip_force_quick_gelu_ignores_explicit_quickgelu_models():
    assert not embedder._clip_force_quick_gelu("ViT-L-14-quickgelu", "openai")


def test_clip_force_quick_gelu_only_for_openai_weights():
    assert not embedder._clip_force_quick_gelu("ViT-L-14", "laion400m_e31")
    assert not embedder._clip_force_quick_gelu("ViT-L-14", None)
