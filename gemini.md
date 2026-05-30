# Vibe ERP Architecture Decisions

## 語言與回應規範
- **繁體中文回應**：所有與用戶的對話、回覆、說明文件，以及系統中的所有提示文字，必須完全使用繁體中文（Taiwanese Traditional Chinese）。

## UI / UX
- **Custom Dialogs**: The system will NO LONGER use native `alert()` or `confirm()` methods. 
- **Implementation**: A high-level modal component (`#dialog-container`) is implemented to handle all alerts and confirmations.
- **Async Pattern**: Use `await app.alert(msg)` and `await app.confirm(msg)` for cleaner flow control.
- **Z-Index**: Dialogs must stay on the highest layer (`z-index: 2000+`) to ensure they are visible above standard modals.

## Git 版本控制規範
- **禁止自動 Commit**：未經使用者明確指示或確認，助手不得主動執行 `git commit` 或 `git push`。所有改動完成後，應僅暫存或保持修改狀態，待使用者明示「請 Commit」後方能執行提交。

## 開發與測試流程規範
- **測試先行 (TDD) 流程**：本專案遵循「測試先行」的開發流程。在開始任何功能開發或 bug 修復前，助手必須：
  1. 先與使用者溝通並**規劃/撰寫對應的測試案例 (Test Cases)**（不論是新增至 `test.html` 中或以文件清單列出）。
  2. 取得使用者確認同意後，方可**開始對主程式碼進行修改**。
  3. 修改完成後，必須**執行測試案例**並確保全數通過 `PASS`，方可交付手動驗證。
