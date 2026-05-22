# Vibe ERP Architecture Decisions

## 語言與回應規範
- **繁體中文回應**：所有與用戶的對話、回覆、說明文件，以及系統中的所有提示文字，必須完全使用繁體中文（Taiwanese Traditional Chinese）。

## UI / UX
- **Custom Dialogs**: The system will NO LONGER use native `alert()` or `confirm()` methods. 
- **Implementation**: A high-level modal component (`#dialog-container`) is implemented to handle all alerts and confirmations.
- **Async Pattern**: Use `await app.alert(msg)` and `await app.confirm(msg)` for cleaner flow control.
- **Z-Index**: Dialogs must stay on the highest layer (`z-index: 2000+`) to ensure they are visible above standard modals.
