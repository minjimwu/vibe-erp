// Initialize Dexie
const db = new Dexie('VibeERP');

// Define database schema
db.version(2).stores({
    products: 'id, name, category, cost, price, stock, supplier_id', // 產品代碼, 產品名稱, 產品類別, 進貨成本, 預計售價, 庫存量, 供應商
    suppliers: 'id, name, contact, phone', // 廠商編號, 廠商名稱, 聯絡人, 電話
    customers: 'id, name, phone, address', // 客戶編號, 客戶名稱, 電話, 地址
    purchases: 'id, date, supplier_id, product_id, cost, qty, total', // 進貨單
    sales: 'id, date, customer_id, product_id, price, qty, total' // 出貨單
});

// Utility DB wrapper
const DB = {
    // Insert array of objects (e.g. from Excel)
    async bulkInsert(table, data) {
        await db[table].clear();
        return await db[table].bulkAdd(data);
    },

    // Get all records
    async getAll(table) {
        return await db[table].toArray();
    },

    // Add or replace a record
    async save(table, data) {
        return await db[table].put(data);
    },

    // Delete record
    async delete(table, id) {
        return await db[table].delete(id);
    },

    // Clear all DB
    async clearAll() {
        await Promise.all([
            db.products.clear(),
            db.suppliers.clear(),
            db.customers.clear(),
            db.purchases.clear(),
            db.sales.clear()
        ]);
    }
};
