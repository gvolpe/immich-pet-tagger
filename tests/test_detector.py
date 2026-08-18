import detector


def test_select_yolo_device_auto_uses_cpu_without_cuda(monkeypatch):
    monkeypatch.setattr(detector, "YOLO_DEVICE", "auto")
    monkeypatch.setattr(detector.torch.cuda, "is_available", lambda: False)

    assert detector._select_yolo_device() == "cpu"


def test_select_yolo_device_auto_uses_cuda_when_available(monkeypatch):
    monkeypatch.setattr(detector, "YOLO_DEVICE", "auto")
    monkeypatch.setattr(detector.torch.cuda, "is_available", lambda: True)

    assert detector._select_yolo_device() == "cuda"


def test_select_yolo_device_honors_explicit_cpu(monkeypatch):
    monkeypatch.setattr(detector, "YOLO_DEVICE", "cpu")
    monkeypatch.setattr(detector.torch.cuda, "is_available", lambda: True)

    assert detector._select_yolo_device() == "cpu"


def test_select_yolo_device_falls_back_when_cuda_unavailable(monkeypatch):
    monkeypatch.setattr(detector, "YOLO_DEVICE", "cuda")
    monkeypatch.setattr(detector.torch.cuda, "is_available", lambda: False)

    assert detector._select_yolo_device() == "cpu"
