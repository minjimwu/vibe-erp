// Core Application Logic
const app = {
    currentView: '',
    chartInstance: null,
    pages: { purchases: 1, sales: 1 },
    pageSize: 10,

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
            'spreadsheet': '批次編輯 Spreadsheet',
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
                case 'spreadsheet': await this.renderSpreadsheet(); break;
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
        let data = await DB.getAll('purchases');
        const tbody = document.getElementById('purchases-tbody');
        const paginationDiv = document.getElementById('purchases-pagination');

        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">尚無進貨資料。</td></tr>';
            if (paginationDiv) paginationDiv.innerHTML = '';
            return;
        }

        // Sort by Date DESC
        data.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Pagination
        const totalPages = Math.ceil(data.length / this.pageSize);
        const currentPage = this.pages.purchases || 1;
        const startIndex = (currentPage - 1) * this.pageSize;
        const pageData = data.slice(startIndex, startIndex + this.pageSize);

        tbody.innerHTML = pageData.map(item => `
            <tr>
                <td>${item.id || ''}</td>
                <td>${item.date || ''}</td>
                <td>${item.supplier_id || ''}</td>
                <td>${item.product_id || ''}</td>
                <td>$${Number(item.cost || 0).toLocaleString()}</td>
                <td>${item.qty || 0}</td>
                <td><strong>$${Number(item.total || 0).toLocaleString()}</strong></td>
            </tr>
        `).join('');

        this.renderPaginationControls('purchases', totalPages, paginationDiv);
    },

    async renderSales() {
        let data = await DB.getAll('sales');
        const tbody = document.getElementById('sales-tbody');
        const paginationDiv = document.getElementById('sales-pagination');

        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">尚無出貨資料。</td></tr>';
            if (paginationDiv) paginationDiv.innerHTML = '';
            return;
        }

        // Sort by Date DESC
        data.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Pagination
        const totalPages = Math.ceil(data.length / this.pageSize);
        const currentPage = this.pages.sales || 1;
        const startIndex = (currentPage - 1) * this.pageSize;
        const pageData = data.slice(startIndex, startIndex + this.pageSize);

        tbody.innerHTML = pageData.map(item => `
            <tr>
                <td>${item.id || ''}</td>
                <td>${item.date || ''}</td>
                <td>${item.customer_id || ''}</td>
                <td>${item.product_id || ''}</td>
                <td>$${Number(item.price || 0).toLocaleString()}</td>
                <td>${item.qty || 0}</td>
                <td><strong>$${Number(item.total || 0).toLocaleString()}</strong></td>
            </tr>
        `).join('');

        this.renderPaginationControls('sales', totalPages, paginationDiv);
    },

    renderPaginationControls(type, totalPages, container) {
        if (!container) return;
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        const currentPage = this.pages[type] || 1;
        let html = `<div class="pagination">`;
        
        // Prev button
        html += `<button class="btn btn-sm btn-outline" ${currentPage === 1 ? 'disabled' : ''} onclick="app.changePage('${type}', ${currentPage - 1})"><i class="ph ph-caret-left"></i></button>`;
        
        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline'}" onclick="app.changePage('${type}', ${i})">${i}</button>`;
            } else if (i === currentPage - 2 || i === currentPage + 2) {
                html += `<span class="pagination-ellipsis">...</span>`;
            }
        }
        
        // Next button
        html += `<button class="btn btn-sm btn-outline" ${currentPage === totalPages ? 'disabled' : ''} onclick="app.changePage('${type}', ${currentPage + 1})"><i class="ph ph-caret-right"></i></button>`;
        
        html += `</div><div class="pagination-info text-muted">第 ${currentPage} 頁 / 共 ${totalPages} 頁</div>`;
        container.innerHTML = html;
    },

    changePage(type, page) {
        this.pages[type] = page;
        if (type === 'purchases') this.renderPurchases();
        if (type === 'sales') this.renderSales();
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
        const tbody = document.getElementById('reports-tbody');
        const totalSpan = document.getElementById('report-total');

        if (!select || !tbody) return;

        // Fill customer select if empty (keep current selection if exists)
        const currentVal = select.value;
        select.innerHTML = '<option value="">所有客戶</option>' + 
            customers.map(c => `<option value="${c.id}">${c.name} (${c.id})</option>`).join('');
        select.value = currentVal;

        const filterAndRender = () => {
            const cid = select.value;
            const filtered = cid ? sales.filter(s => s.customer_id === cid) : sales;
            
            // Sort by Date DESC
            filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (!filtered.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">尚無符合條件的銷售紀錄。</td></tr>';
                totalSpan.innerText = '$0';
                return;
            }

            tbody.innerHTML = filtered.map(item => `
                <tr>
                    <td>${item.id || ''}</td>
                    <td>${item.date || ''}</td>
                    <td>${item.customer_id || ''}</td>
                    <td>${item.product_id || ''}</td>
                    <td>$${Number(item.price || 0).toLocaleString()}</td>
                    <td>${item.qty || 0}</td>
                    <td><strong>$${Number(item.total || 0).toLocaleString()}</strong></td>
                </tr>
            `).join('');

            const total = filtered.reduce((sum, s) => sum + (s.total || 0), 0);
            totalSpan.innerText = `$${total.toLocaleString()}`;
        };

        select.onchange = filterAndRender;
        filterAndRender();
    },

    // --- Spreadsheet Logic (Handsontable integration) ---
    hot: null,
    async renderSpreadsheet() {
        const tableSelect = document.getElementById('spreadsheet-select-table');
        const saveBtn = document.getElementById('btn-spreadsheet-save');
        const refreshBtn = document.getElementById('btn-spreadsheet-refresh');
        const gridDiv = document.getElementById('spreadsheet-grid');

        const loadGrid = async () => {
            const tableName = tableSelect.value;
            const data = await DB.getAll(tableName);

            let columns = [];
            let headers = [];

            if (tableName === 'products') {
                columns = [
                    { data: 'id', type: 'text' },
                    { data: 'name', type: 'text' },
                    { data: 'category', type: 'text' },
                    { data: 'cost', type: 'numeric' },
                    { data: 'price', type: 'numeric' },
                    { data: 'stock', type: 'numeric' },
                    { data: 'supplier_id', type: 'text' }
                ];
                headers = ["產品代碼", "產品名稱", "產品類別", "進貨成本", "預計售價", "庫存量", "供應商ID"];
            } else if (tableName === 'suppliers') {
                columns = [
                    { data: 'id' }, { data: 'name' }, { data: 'contact' }, { data: 'phone' }
                ];
                headers = ["廠商編號", "廠商名稱", "聯絡人", "電話"];
            } else if (tableName === 'customers') {
                columns = [
                    { data: 'id' }, { data: 'name' }, { data: 'phone' }, { data: 'address' }
                ];
                headers = ["客戶編號", "客戶名稱", "電話", "地址"];
            }

            if (this.hot) {
                this.hot.destroy();
            }

            this.hot = new Handsontable(gridDiv, {
                data: data,
                columns: columns,
                colHeaders: headers,
                rowHeaders: true,
                stretchH: 'all',
                height: 500,
                autoWrapRow: true,
                autoWrapCol: true,
                licenseKey: 'non-commercial-and-evaluation', // For evaluation use
                contextMenu: true,
                filters: true,
                dropdownMenu: true,
                minSpareRows: 1, // Allow adding new rows by clicking below
                manualColumnResize: true,
                copyPaste: true, // Crucial for user requirements
            });
        };

        tableSelect.addEventListener('change', () => loadGrid());
        refreshBtn.addEventListener('click', () => loadGrid());

        saveBtn.addEventListener('click', async () => {
            const updatedData = this.hot.getSourceData();
            const tableName = tableSelect.value;

            try {
                // Filter out empty rows (where ID is missing)
                const finalData = updatedData.filter(row => row.id && row.id.toString().trim() !== '');

                await DB.bulkInsert(tableName, finalData);
                this.showToast('批次更新成功');
                await loadGrid();
            } catch (err) {
                console.error(err);
                this.showToast('更新失敗，請確認資料格式與 ID 是否重複');
            }
        });

        await loadGrid();
    },

    // --- Excel Functionality ---

    downloadTemplate() {
        const wb = XLSX.utils.book_new();

        const productsData = SampleData.getProducts();
        const suppliersData = SampleData.getSuppliers();
        const customersData = SampleData.getCustomers();
        const purchasesData = SampleData.generatePurchases(productsData);
        const salesData = SampleData.generateSales(productsData);

        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(productsData), "商品庫存");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(suppliersData), "進貨廠商");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(customersData), "客戶資料");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(purchasesData), "進貨紀錄");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(salesData), "出貨紀錄");

        XLSX.writeFile(wb, "VibeERP_Diving_Store_Demo.xlsx");
        this.showToast("範例資料範本已下載");
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
        if (await this.confirm('確定要刪除這筆資料嗎？')) {
            await DB.delete(table, id);
            this.showToast('刪除成功');
            this.navigate(this.currentView);
        }
    },

    async clearDatabase() {
        if (await this.confirm('警告：此操作將清除所有系統中的資料且不可還原。您確定嗎？', '危險操作')) {
            await DB.clearAll();
            this.showToast('資料已全數清除');
            this.navigate('dashboard');
        }
    },

    // --- Modal Logic (Basic support for adding Product/Purchase/Sale) ---
    async showModal(type) {
        const overlay = document.getElementById('modal-container');
        const mTitle = document.getElementById('modal-title');
        const mBody = document.getElementById('modal-body');
        const mSave = document.getElementById('modal-save-btn');

        overlay.style.display = 'flex';

        let html = '';
        let saveHandler = null;
        let postRender = null;

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
                return true;
            };
        } else if (type === 'purchase-modal') {
            mTitle.innerText = '新增進貨紀錄';
            const tid = this.generateID('P');
            const suppliers = await DB.getAll('suppliers');
            const products = await DB.getAll('products');

            const sOptions = suppliers.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join('');
            const pOptions = products.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join('');

            html = `
                <div class="form-group"><label>進貨單號</label><input type="text" id="m-id" class="form-control" value="${tid}" readonly></div>
                <div class="form-group"><label>日期</label><input type="date" id="m-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}"></div>
                <div class="form-group">
                    <label>廠商</label>
                    <select id="m-sid" class="form-control">
                        <option value="">請選擇廠商...</option>
                        ${sOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>產品</label>
                    <select id="m-pid" class="form-control">
                        <option value="">請選擇產品...</option>
                        ${pOptions}
                    </select>
                </div>
                <div class="form-group"><label>數量</label><input type="number" id="m-qty" class="form-control" value="1"></div>
                <div class="form-group"><label>單位成本</label><input type="number" id="m-cost" class="form-control"></div>
            `;
            
            postRender = () => {
                document.getElementById('m-pid').onchange = (e) => {
                    const prod = products.find(p => p.id === e.target.value);
                    if (prod) document.getElementById('m-cost').value = prod.cost || 0;
                };
            };

            saveHandler = async () => {
                const qty = Number(document.getElementById('m-qty').value);
                const cost = Number(document.getElementById('m-cost').value);
                const pid = document.getElementById('m-pid').value;
                const sid = document.getElementById('m-sid').value;
                
                if (!pid || !sid) { this.alert('請填寫完整資料'); return false; }

                await DB.save('purchases', {
                    id: document.getElementById('m-id').value,
                    date: document.getElementById('m-date').value,
                    product_id: pid,
                    supplier_id: sid,
                    qty: qty,
                    cost: cost,
                    total: qty * cost
                });

                const prod = await db.products.get(pid);
                if (prod) {
                    prod.stock = Number(prod.stock || 0) + qty;
                    await DB.save('products', prod);
                }
                return true;
            };
        } else if (type === 'sale-modal') {
            mTitle.innerText = '新增出貨紀錄';
            const tid = this.generateID('S');
            const customers = await DB.getAll('customers');
            const products = await DB.getAll('products');
            const categories = [...new Set(products.map(p => p.category))].filter(Boolean).sort();

            const cOptions = customers.map(c => `<option value="${c.id}">${c.name} (${c.id})</option>`).join('');
            const catOptions = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

            html = `
                <div class="form-group"><label>出貨單號</label><input type="text" id="m-id" class="form-control" value="${tid}" readonly></div>
                <div class="form-group"><label>日期</label><input type="date" id="m-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}"></div>
                <div class="form-group">
                    <label>客戶</label>
                    <select id="m-cid" class="form-control">
                        <option value="">請選擇客戶...</option>
                        ${cOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>產品類別</label>
                    <select id="m-category" class="form-control">
                        <option value="">請選擇類別...</option>
                        ${catOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>產品項目</label>
                    <select id="m-pid" class="form-control">
                        <option value="">請先選擇類別</option>
                    </select>
                    <div id="m-stock-info" style="font-size: 0.8rem; margin-top: 5px; color: var(--primary-color); font-weight: 600;"></div>
                </div>
                <div class="form-group"><label>數量</label><input type="number" id="m-qty" class="form-control" value="1" min="1"></div>
                <div class="form-group"><label>售價單價</label><input type="number" id="m-price" class="form-control"></div>
            `;

            postRender = () => {
                const catSel = document.getElementById('m-category');
                const pidSel = document.getElementById('m-pid');
                const priceInp = document.getElementById('m-price');
                const stockInfo = document.getElementById('m-stock-info');
                const qtyInp = document.getElementById('m-qty');

                catSel.onchange = () => {
                    const selectedCat = catSel.value;
                    const filtered = products.filter(p => p.category === selectedCat);
                    pidSel.innerHTML = '<option value="">請選擇產品...</option>' + 
                        filtered.map(p => `<option value="${p.id}" data-price="${p.price}" data-stock="${p.stock}">${p.name} (${p.id})</option>`).join('');
                    stockInfo.innerText = '';
                };

                pidSel.onchange = () => {
                    const opt = pidSel.options[pidSel.selectedIndex];
                    const stock = Number(opt.getAttribute('data-stock') || 0);
                    priceInp.value = opt.getAttribute('data-price') || 0;
                    stockInfo.innerText = `目前庫存量: ${stock}`;
                    qtyInp.max = stock;
                    if (Number(qtyInp.value) > stock) qtyInp.value = stock;
                };
            };

            saveHandler = async () => {
                const qty = Number(document.getElementById('m-qty').value);
                const price = Number(document.getElementById('m-price').value);
                const pid = document.getElementById('m-pid').value;
                const cid = document.getElementById('m-cid').value;

                if (!pid || !cid) { this.alert('請填寫完整資料'); return false; }

                // Double check stock
                const prod = await db.products.get(pid);
                if (!prod || prod.stock < qty) {
                    await this.alert(`庫存不足！目前庫存僅剩 ${prod ? prod.stock : 0}`);
                    return false;
                }

                await DB.save('sales', {
                    id: document.getElementById('m-id').value,
                    date: document.getElementById('m-date').value,
                    customer_id: cid,
                    product_id: pid,
                    qty: qty,
                    price: price,
                    total: qty * price
                });

                prod.stock = Number(prod.stock || 0) - qty;
                await DB.save('products', prod);
                return true;
            };
        }

        mBody.innerHTML = html;
        if (postRender) postRender();

        mSave.onclick = async () => {
            if (saveHandler) {
                const success = await saveHandler();
                if (success === true) {
                    this.hideModal();
                    this.showToast('新增成功');
                    this.navigate(this.currentView);
                }
            }
        };
    },

    hideModal() {
        document.getElementById('modal-container').style.display = 'none';
        document.getElementById('modal-body').innerHTML = '';
    },

    // --- Custom Dialogs (replacing alert/confirm) ---
    dialogPromise: null,
    alert(message, title = '提示') {
        return this.showDialog(message, title, false);
    },
    confirm(message, title = '確認') {
        return this.showDialog(message, title, true);
    },
    showDialog(message, title, showCancel) {
        document.getElementById('dialog-title').innerText = title;
        document.getElementById('dialog-body').innerText = message;
        document.getElementById('dialog-cancel-btn').style.display = showCancel ? 'inline-block' : 'none';
        document.getElementById('dialog-container').style.display = 'flex';
        return new Promise(resolve => {
            this.dialogPromise = resolve;
        });
    },
    closeDialog(result) {
        document.getElementById('dialog-container').style.display = 'none';
        if (this.dialogPromise) {
            this.dialogPromise(result);
            this.dialogPromise = null;
        }
    },

    generateID(prefix) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        return `${prefix}${y}${m}${d}${hh}${mm}${ss}${ms}`;
    }
};

// Start application
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
