// Core Application Logic
const app = {
    currentView: '',
    chartInstance: null,

    // Initialize the app
    async init() {
        this.bindEvents();
        // Show dashboard by default
        await this.navigate('dashboard');
    },

    // Bind all global events
    bindEvents() {
        // Navigation links
        document.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = e.currentTarget.getAttribute('data-view');
                this.navigate(view);
            });
        });

        // Topbar actions
        document.getElementById('btn-download-template').addEventListener('click', () => this.downloadTemplate());
        document.getElementById('btn-export').addEventListener('click', () => this.exportData());

        const fileInput = document.getElementById('file-upload');
        fileInput.addEventListener('change', (e) => this.importData(e));
    },

    // Navigation and rendering
    async navigate(view) {
        this.currentView = view;

        // Update active class on sidebar
        document.querySelectorAll('.nav-item').forEach(link => {
            if (link.getAttribute('data-view') === view) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Update Title
        const titles = {
            'dashboard': '總覽 Dashboard',
            'products': '商品庫存 Products',
            'purchases': '進貨管理 Purchases',
            'sales': '出貨管理 Sales',
            'suppliers': '進貨廠商 Suppliers',
            'customers': '客戶資料 Customers',
            'reports': '銷售報表 Reports',
            'settings': '系統資料 Settings'
        };
        document.getElementById('page-title').innerText = titles[view] || 'Vibe ERP';

        // Load Template
        const tpl = document.getElementById(`tpl-${view}`).innerHTML;
        const container = document.getElementById('view-container');

        // Fade transition
        container.style.opacity = 0;

        setTimeout(async () => {
            container.innerHTML = tpl;

            // Load specific data based on view
            await this.loadViewData(view);

            container.style.opacity = 1;
            container.style.transition = 'opacity 0.3s ease';
        }, 150);
    },

    async loadViewData(view) {
        try {
            switch (view) {
                case 'dashboard': await this.renderDashboard(); break;
                case 'products': await this.renderProducts(); break;
                case 'purchases': await this.renderPurchases(); break;
                case 'sales': await this.renderSales(); break;
                case 'suppliers': await this.renderSuppliers(); break;
                case 'customers': await this.renderCustomers(); break;
                case 'reports': await this.renderReports(); break;
            }
        } catch (e) {
            console.error("Error loading view data:", e);
            this.showToast("載入資料發生錯誤");
        }
    },

    // --- Render Methods ---
    async renderDashboard() {
        const products = await DB.getAll('products');
        const customers = await DB.getAll('customers');
        const sales = await DB.getAll('sales');

        document.getElementById('stat-products').innerText = products.length;
        document.getElementById('stat-customers').innerText = customers.length;

        let revenue = 0;
        sales.forEach(s => revenue += Number(s.total) || 0);
        document.getElementById('stat-revenue').innerText = '$' + revenue.toLocaleString();

        const lowStock = products.filter(p => Number(p.stock) < 10);
        document.getElementById('stat-low-stock').innerText = `${lowStock.length} 項`;

        // Render Chart
        const ctx = document.getElementById('dashboard-chart-sales');
        if (ctx) {
            if (this.chartInstance) this.chartInstance.destroy();

            // Group sales by date
            const salesByDate = {};
            sales.forEach(s => {
                const d = s.date || '未知';
                salesByDate[d] = (salesByDate[d] || 0) + Number(s.total || 0);
            });

            const labels = Object.keys(salesByDate).sort().slice(-7); // last 7 entry dates
            const data = labels.map(l => salesByDate[l]);

            this.chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels.length ? labels : ['無資料'],
                    datasets: [{
                        label: '營業額',
                        data: data.length ? data : [0],
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }
    },

    async renderProducts() {
        const data = await DB.getAll('products');
        const tbody = document.getElementById('products-tbody');
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">尚無資料，請先新增或匯入 Excel 檔案。</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${item.id || ''}</td>
                <td><strong>${item.name || ''}</strong></td>
                <td><span class="category-badge">${item.category || ''}</span></td>
                <td>$${Number(item.cost || 0).toLocaleString()}</td>
                <td>$${Number(item.price || 0).toLocaleString()}</td>
                <td><span style="color: ${item.stock < 10 ? 'red' : 'inherit'}">${item.stock || 0}</span></td>
                <td>${item.supplier_id || ''}</td>
                <td><button class="btn btn-sm btn-outline" onclick="app.deleteRecord('products', '${item.id}')">刪除</button></td>
            </tr>
        `).join('');
    },

    async renderPurchases() {
        const data = await DB.getAll('purchases');
        const tbody = document.getElementById('purchases-tbody');
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">尚無進貨資料。</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${item.id || ''}</td>
                <td>${item.date || ''}</td>
                <td>${item.supplier_id || ''}</td>
                <td>${item.product_id || ''}</td>
                <td>$${item.cost || 0}</td>
                <td>${item.qty || 0}</td>
                <td><strong>$${Number(item.total || 0).toLocaleString()}</strong></td>
            </tr>
        `).join('');
    },

    async renderSales() {
        const data = await DB.getAll('sales');
        const tbody = document.getElementById('sales-tbody');
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">尚無出貨資料。</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${item.id || ''}</td>
                <td>${item.date || ''}</td>
                <td>${item.customer_id || ''}</td>
                <td>${item.product_id || ''}</td>
                <td>$${item.price || 0}</td>
                <td>${item.qty || 0}</td>
                <td><strong>$${Number(item.total || 0).toLocaleString()}</strong></td>
            </tr>
        `).join('');
    },

    async renderSuppliers() {
        const data = await DB.getAll('suppliers');
        const tbody = document.getElementById('suppliers-tbody');
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">尚無廠商資料。</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${item.id || ''}</td>
                <td><strong>${item.name || ''}</strong></td>
                <td>${item.contact || ''}</td>
                <td>${item.phone || ''}</td>
            </tr>
        `).join('');
    },

    async renderCustomers() {
        const data = await DB.getAll('customers');
        const tbody = document.getElementById('customers-tbody');
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">尚無客戶資料。</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${item.id || ''}</td>
                <td><strong>${item.name || ''}</strong></td>
                <td>${item.phone || ''}</td>
                <td>${item.address || ''}</td>
            </tr>
        `).join('');
    },

    async renderReports() {
        const customers = await DB.getAll('customers');
        const sales = await DB.getAll('sales');

        const select = document.getElementById('report-customer-select');
        select.innerHTML = '<option value="">所有客戶</option>' + customers.map(c => `<option value="${c.id}">${c.name} (${c.id})</option>`).join('');

        const renderTable = (filterCustomerId) => {
            const filteredSales = filterCustomerId ? sales.filter(s => s.customer_id == filterCustomerId) : sales;
            const tbody = document.getElementById('reports-tbody');

            if (!filteredSales.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">查無資料。</td></tr>';
                document.getElementById('report-total').innerText = '$0';
                return;
            }

            let total = 0;
            tbody.innerHTML = filteredSales.map(item => {
                total += Number(item.total || 0);
                const cName = customers.find(c => c.id == item.customer_id)?.name || item.customer_id;
                return `
                    <tr>
                        <td>${item.id || ''}</td>
                        <td>${item.date || ''}</td>
                        <td>${cName}</td>
                        <td>${item.product_id || ''}</td>
                        <td>$${item.price || 0}</td>
                        <td>${item.qty || 0}</td>
                        <td>$${Number(item.total || 0).toLocaleString()}</td>
                    </tr>
                `;
            }).join('');

            document.getElementById('report-total').innerText = '$' + total.toLocaleString();
        };

        renderTable('');

        select.addEventListener('change', (e) => {
            renderTable(e.target.value);
        });
    },

    // --- Excel Functionality ---

    downloadTemplate() {
        const wb = XLSX.utils.book_new();

        const wsProducts = XLSX.utils.aoa_to_sheet([["產品代碼", "產品名稱", "產品類別", "進貨成本", "預計售價", "庫存量", "供應商ID"]]);
        const wsSuppliers = XLSX.utils.aoa_to_sheet([["廠商編號", "廠商名稱", "聯絡人", "電話"]]);
        const wsCustomers = XLSX.utils.aoa_to_sheet([["客戶編號", "客戶名稱", "電話", "地址"]]);
        const wsPurchases = XLSX.utils.aoa_to_sheet([["進貨單號", "日期", "廠商編號", "產品代碼", "單位成本", "數量", "總金額"]]);
        const wsSales = XLSX.utils.aoa_to_sheet([["出貨單號", "日期", "客戶編號", "產品代碼", "售價單價", "數量", "總金額"]]);

        XLSX.utils.book_append_sheet(wb, wsProducts, "商品庫存");
        XLSX.utils.book_append_sheet(wb, wsSuppliers, "進貨廠商");
        XLSX.utils.book_append_sheet(wb, wsCustomers, "客戶資料");
        XLSX.utils.book_append_sheet(wb, wsPurchases, "進貨紀錄");
        XLSX.utils.book_append_sheet(wb, wsSales, "出貨紀錄");

        XLSX.writeFile(wb, "VibeERP_Template.xlsx");
        this.showToast("範本已下載");
    },

    async exportData() {
        const wb = XLSX.utils.book_new();

        const mapToSheet = async (tableName, sheetName, mapping) => {
            const data = await DB.getAll(tableName);
            const aoa = [Object.values(mapping)]; // Headers
            data.forEach(item => {
                const row = Object.keys(mapping).map(k => item[k] || '');
                aoa.push(row);
            });
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        };

        await mapToSheet('products', '商品庫存', { id: "產品代碼", name: "產品名稱", category: "產品類別", cost: "進貨成本", price: "預計售價", stock: "庫存量", supplier_id: "供應商ID" });
        await mapToSheet('suppliers', '進貨廠商', { id: "廠商編號", name: "廠商名稱", contact: "聯絡人", phone: "電話" });
        await mapToSheet('customers', '客戶資料', { id: "客戶編號", name: "客戶名稱", phone: "電話", address: "地址" });
        await mapToSheet('purchases', '進貨紀錄', { id: "進貨單號", date: "日期", supplier_id: "廠商編號", product_id: "產品代碼", cost: "單位成本", qty: "數量", total: "總金額" });
        await mapToSheet('sales', '出貨紀錄', { id: "出貨單號", date: "日期", customer_id: "客戶編號", product_id: "產品代碼", price: "售價單價", qty: "數量", total: "總金額" });

        XLSX.writeFile(wb, `VibeERP_Backup_${new Date().toISOString().slice(0, 10)}.xlsx`);
        this.showToast("資料已匯出");
    },

    importData(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const processSheet = async (sheetName, dbTable, mapping) => {
                    const sheet = workbook.Sheets[sheetName];
                    if (!sheet) return;
                    const json = XLSX.utils.sheet_to_json(sheet);
                    const formatted = json.map(row => {
                        const obj = {};
                        for (let key in mapping) {
                            obj[key] = row[mapping[key]];
                        }
                        return obj;
                    });
                    if (formatted.length > 0) {
                        await DB.bulkInsert(dbTable, formatted);
                    }
                };

                await db.transaction('rw', db.products, db.suppliers, db.customers, db.purchases, db.sales, async () => {
                    await processSheet('商品庫存', 'products', { id: "產品代碼", name: "產品名稱", category: "產品類別", cost: "進貨成本", price: "預計售價", stock: "庫存量", supplier_id: "供應商ID" });
                    await processSheet('進貨廠商', 'suppliers', { id: "廠商編號", name: "廠商名稱", contact: "聯絡人", phone: "電話" });
                    await processSheet('客戶資料', 'customers', { id: "客戶編號", name: "客戶名稱", phone: "電話", address: "地址" });
                    await processSheet('進貨紀錄', 'purchases', { id: "進貨單號", date: "日期", supplier_id: "廠商編號", product_id: "產品代碼", cost: "單位成本", qty: "數量", total: "總金額" });
                    await processSheet('出貨紀錄', 'sales', { id: "出貨單號", date: "日期", customer_id: "客戶編號", product_id: "產品代碼", price: "售價單價", qty: "數量", total: "總金額" });
                });

                this.showToast("資料匯入成功");
                e.target.value = ''; // reset file input
                await this.navigate(this.currentView); // reload view
            } catch (err) {
                console.error(err);
                this.showToast("匯入失敗，請確認檔案格式是否正確");
            }
        };
        reader.readAsArrayBuffer(file);
    },

    // --- UI Helpers ---

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.innerText = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },

    async deleteRecord(table, id) {
        if (confirm('確定要刪除這筆資料嗎？')) {
            await DB.delete(table, id);
            this.showToast('刪除成功');
            this.navigate(this.currentView);
        }
    },

    async clearDatabase() {
        if (confirm('警告：此操作將清除所有系統中的資料且不可還原。您確定嗎？')) {
            await DB.clearAll();
            this.showToast('資料已全數清除');
            this.navigate('dashboard');
        }
    },

    // --- Modal Logic (Basic support for adding Product/Purchase/Sale) ---
    showModal(type) {
        const overlay = document.getElementById('modal-container');
        const mTitle = document.getElementById('modal-title');
        const mBody = document.getElementById('modal-body');
        const mSave = document.getElementById('modal-save-btn');

        overlay.style.display = 'flex';

        let html = '';
        let saveHandler = null;

        if (type === 'product-modal') {
            mTitle.innerText = '新增商品';
            html = `
                <div class="form-group"><label>產品代碼</label><input type="text" id="m-id" class="form-control"></div>
                <div class="form-group"><label>產品名稱</label><input type="text" id="m-name" class="form-control"></div>
                <div class="form-group"><label>產品類別</label><input type="text" id="m-category" class="form-control"></div>
                <div class="form-group"><label>進貨成本</label><input type="number" id="m-cost" class="form-control"></div>
                <div class="form-group"><label>預計售價</label><input type="number" id="m-price" class="form-control"></div>
                <div class="form-group"><label>庫存量</label><input type="number" id="m-stock" class="form-control"></div>
            `;
            saveHandler = async () => {
                await DB.save('products', {
                    id: document.getElementById('m-id').value,
                    name: document.getElementById('m-name').value,
                    category: document.getElementById('m-category').value,
                    cost: document.getElementById('m-cost').value,
                    price: document.getElementById('m-price').value,
                    stock: document.getElementById('m-stock').value,
                    supplier_id: ''
                });
            };
        } else if (type === 'purchase-modal') {
            mTitle.innerText = '新增進貨紀錄';
            const tid = 'P' + Date.now();
            html = `
                <div class="form-group"><label>進貨單號</label><input type="text" id="m-id" class="form-control" value="${tid}" readonly></div>
                <div class="form-group"><label>日期</label><input type="date" id="m-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}"></div>
                <div class="form-group"><label>產品代碼</label><input type="text" id="m-pid" class="form-control"></div>
                <div class="form-group"><label>數量</label><input type="number" id="m-qty" class="form-control"></div>
                <div class="form-group"><label>單位成本</label><input type="number" id="m-cost" class="form-control"></div>
            `;
            saveHandler = async () => {
                const qty = Number(document.getElementById('m-qty').value);
                const cost = Number(document.getElementById('m-cost').value);
                const pid = document.getElementById('m-pid').value;
                await DB.save('purchases', {
                    id: document.getElementById('m-id').value,
                    date: document.getElementById('m-date').value,
                    product_id: pid,
                    supplier_id: 'S001',
                    qty: qty,
                    cost: cost,
                    total: qty * cost
                });

                // Update stock dynamically
                const prod = await db.products.get(pid);
                if (prod) {
                    prod.stock = Number(prod.stock || 0) + qty;
                    await DB.save('products', prod);
                }
            };
        } else if (type === 'sale-modal') {
            mTitle.innerText = '新增出貨紀錄';
            const tid = 'S' + Date.now();
            html = `
                <div class="form-group"><label>出貨單號</label><input type="text" id="m-id" class="form-control" value="${tid}" readonly></div>
                <div class="form-group"><label>日期</label><input type="date" id="m-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}"></div>
                <div class="form-group"><label>客戶編號</label><input type="text" id="m-cid" class="form-control"></div>
                <div class="form-group"><label>產品代碼</label><input type="text" id="m-pid" class="form-control"></div>
                <div class="form-group"><label>數量</label><input type="number" id="m-qty" class="form-control"></div>
                <div class="form-group"><label>售價單價</label><input type="number" id="m-price" class="form-control"></div>
            `;
            saveHandler = async () => {
                const qty = Number(document.getElementById('m-qty').value);
                const price = Number(document.getElementById('m-price').value);
                const pid = document.getElementById('m-pid').value;
                await DB.save('sales', {
                    id: document.getElementById('m-id').value,
                    date: document.getElementById('m-date').value,
                    customer_id: document.getElementById('m-cid').value,
                    product_id: pid,
                    qty: qty,
                    price: price,
                    total: qty * price
                });

                // Deduct stock dynamically
                const prod = await db.products.get(pid);
                if (prod) {
                    prod.stock = Number(prod.stock || 0) - qty;
                    await DB.save('products', prod);
                }
            };
        }

        mBody.innerHTML = html;
        mSave.onclick = async () => {
            if (saveHandler) {
                await saveHandler();
                this.hideModal();
                this.showToast('新增成功');
                this.navigate(this.currentView);
            }
        };
    },

    hideModal() {
        document.getElementById('modal-container').style.display = 'none';
        document.getElementById('modal-body').innerHTML = '';
    }
};

// Start application
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
