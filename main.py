from __future__ import annotations

import os
import sys

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication

from browser.window import BrowserWindow
from settings.store import AppSettings


def main() -> int:
    os.environ.setdefault("QTWEBENGINE_CHROMIUM_FLAGS", "--enable-features=OverlayScrollbar")
    QApplication.setAttribute(Qt.ApplicationAttribute.AA_DontCreateNativeWidgetSiblings)

    app = QApplication(sys.argv)
    app.setApplicationName("Aurora Browser")
    app.setOrganizationName("Local")

    settings = AppSettings.load()
    window = BrowserWindow(settings=settings)
    window.show()

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
