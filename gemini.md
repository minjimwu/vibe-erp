# Vibe ERP Architecture Decisions

## UI / UX
- **Custom Dialogs**: The system will NO LONGER use native `alert()` or `confirm()` methods. 
- **Implementation**: A high-level modal component (`#dialog-container`) is implemented to handle all alerts and confirmations.
- **Async Pattern**: Use `await app.alert(msg)` and `await app.confirm(msg)` for cleaner flow control.
- **Z-Index**: Dialogs must stay on the highest layer (`z-index: 2000+`) to ensure they are visible above standard modals.
