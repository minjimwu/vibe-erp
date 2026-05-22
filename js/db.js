// Initialize Dexie
const db = new Dexie('VibeERP');

// Define database schema
db.version(3).stores({
    products: 'id, name, category, cost, price, stock, unit, supplier_id', // 產品代碼, 名稱, 類別, 成本, 售價, 庫存, 單位, 供應商
    suppliers: 'id, name, full_name, contact, phone, mobile, tax_id, email, fax, zip_code, address, remark', // 廠商資料（含擴充欄位）
    customers: 'id, name, phone, address, english_name, salesperson, birthday, gender, email, tax_id, invoice_title, vip_card, member_card, store_value_id, customer_type, fax, zip_code, remarks', // 客戶資料（含擴充欄位）
    purchases: 'id, date, supplier_id, product_id, cost, qty, total', // 進貨單
    sales: 'id, date, customer_id, product_id, price, qty, total, employee, discount, shipping, cost, profit, tax, net_total, original_order_id' // 出貨單（含業績報表擴充欄位）
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
