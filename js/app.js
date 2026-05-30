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
                case 'settings': await this.renderSettings(); break;
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
        const filterSel = document.getElementById('product-category-filter');

        // Populate category filter options dynamically
        if (filterSel) {
            const currentFilter = filterSel.value;
            const categories = [...new Set(data.map(p => p.category))].filter(Boolean).sort();
            filterSel.innerHTML = '<option value="">全部類別</option>' +
                categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
            filterSel.value = currentFilter;
        }

        // Apply category filter
        const filterVal = filterSel ? filterSel.value : '';
        const filteredData = filterVal ? data.filter(p => p.category === filterVal) : data;

        if (!filteredData.length) {
            tbody.innerHTML = filterVal 
                ? `<tr><td colspan="9" class="text-center">尚無符合類別「${filterVal}」的商品。</td></tr>`
                : '<tr><td colspan="9" class="text-center">尚無資料，請先新增或匯入 Excel 檔案。</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.map(item => `
            <tr>
                <td>${item.id || ''}</td>
                <td><span class="category-badge">${item.category || ''}</span></td>
                <td><strong>${item.name || ''}</strong></td>
                <td>$${Number(item.cost || 0).toLocaleString()}</td>
                <td>$${Number(item.price || 0).toLocaleString()}</td>
                <td><span style="color: ${Number(item.stock) < 10 ? 'var(--danger)' : 'inherit'}">${item.stock || 0}</span></td>
                <td>${item.unit || ''}</td>
                <td>${item.supplier_id || ''}</td>
                <td><button class="btn btn-sm btn-outline" onclick="app.deleteRecord('products', '${item.id}')">刪除</button></td>
            </tr>
        `).join('');
    },

    filterProducts() {
        this.renderProducts();
    },

    async renderPurchases() {
        const [purchases, suppliers, products] = await Promise.all([
            DB.getAll('purchases'),
            DB.getAll('suppliers'),
            DB.getAll('products')
        ]);

        const supplierMap = new Map(suppliers.map(s => [s.id, s.name]));
        const productMap = new Map(products.map(p => [p.id, p.name]));

        const tbody = document.getElementById('purchases-tbody');
        const paginationDiv = document.getElementById('purchases-pagination');

        if (!purchases.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">尚無進貨資料。</td></tr>';
            if (paginationDiv) paginationDiv.innerHTML = '';
            return;
        }

        // Group purchases by Purchase ID (remove -suffix)
        const orderGroups = {};
        purchases.forEach(item => {
            const orderId = (item.id || '').split('-')[0];
            if (!orderGroups[orderId]) {
                orderGroups[orderId] = {
                    id: orderId,
                    date: item.date,
                    supplier_id: item.supplier_id,
                    total: 0,
                    items: []
                };
            }
            orderGroups[orderId].total += Number(item.total || 0);
            orderGroups[orderId].items.push(item);
        });

        const groupedPurchases = Object.values(orderGroups);

        // Sort by Date DESC, then by ID DESC if dates are equal
        groupedPurchases.sort((a, b) => {
            const dateDiff = new Date(b.date) - new Date(a.date);
            if (dateDiff !== 0) return dateDiff;
            return (b.id || '').localeCompare(a.id || '');
        });

        // Pagination
        const totalPages = Math.ceil(groupedPurchases.length / this.pageSize);
        const currentPage = this.pages.purchases || 1;
        const startIndex = (currentPage - 1) * this.pageSize;
        const pageData = groupedPurchases.slice(startIndex, startIndex + this.pageSize);

        tbody.innerHTML = pageData.map(order => {
            const supplierName = supplierMap.get(order.supplier_id) || '未知廠商';
            
            const detailRowsHtml = order.items.map(item => {
                const productName = productMap.get(item.product_id) || '未知產品';
                return `
                    <tr>
                        <td>${item.product_id || ''}</td>
                        <td>${productName}</td>
                        <td>$${Number(item.cost || 0).toLocaleString()}</td>
                        <td>${item.qty || 0}</td>
                        <td><strong>$${Number(item.total || 0).toLocaleString()}</strong></td>
                    </tr>
                `;
            }).join('');

            return `
                <tr class="main-order-row" style="cursor: pointer;" onclick="app.toggleOrderDetail('${order.id}')">
                    <td class="text-center" id="arrow-${order.id}">
                        <i class="ph ph-caret-right" style="transition: transform 0.2s; font-size: 1.1rem; color: var(--primary);"></i>
                    </td>
                    <td><strong>${order.id}</strong></td>
                    <td>${order.date || ''}</td>
                    <td>${order.supplier_id || ''}</td>
                    <td>${supplierName}</td>
                    <td>${order.items.length}</td>
                    <td><span style="color: var(--primary); font-weight: 600;">$${Number(order.total || 0).toLocaleString()}</span></td>
                </tr>
                <tr class="detail-row" id="detail-row-${order.id}" style="display: none; background: rgba(0,0,0,0.01);">
                    <td></td>
                    <td colspan="6">
                        <div style="padding: 12px 18px; border-left: 3px solid var(--primary); background: rgba(0,0,0,0.005); border-radius: 0 8px 8px 0; margin: 4px 0 10px 0;">
                            <h5 style="margin: 0 0 10px 0; font-size: 0.85rem; color: var(--text-muted);">
                                <i class="ph ph-list-bullets"></i> 進貨品項明細
                            </h5>
                            <table class="data-table" style="margin: 0; width: 100%; box-shadow: none; font-size: 0.85rem;">
                                <thead>
                                    <tr>
                                        <th>產品代碼</th>
                                        <th>品項名稱</th>
                                        <th>單位成本</th>
                                        <th>數量</th>
                                        <th>小計</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${detailRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        this.renderPaginationControls('purchases', totalPages, paginationDiv);
    },

    async renderSales() {
        const [sales, customers, products] = await Promise.all([
            DB.getAll('sales'),
            DB.getAll('customers'),
            DB.getAll('products')
        ]);

        const customerMap = new Map(customers.map(c => [c.id, c.name]));
        const productMap = new Map(products.map(p => [p.id, p.name]));

        const tbody = document.getElementById('sales-tbody');
        const paginationDiv = document.getElementById('sales-pagination');

        if (!sales.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">尚無出貨資料。</td></tr>';
            if (paginationDiv) paginationDiv.innerHTML = '';
            return;
        }

        // Group sales by Order ID (remove -suffix)
        const orderGroups = {};
        sales.forEach(item => {
            const orderId = (item.id || '').split('-')[0];
            if (!orderGroups[orderId]) {
                orderGroups[orderId] = {
                    id: orderId,
                    date: item.date,
                    customer_id: item.customer_id,
                    total: 0,
                    items: []
                };
            }
            orderGroups[orderId].total += Number(item.total || 0);
            orderGroups[orderId].items.push(item);
        });

        const groupedSales = Object.values(orderGroups);

        // Sort by Date DESC, then by ID DESC if dates are equal
        groupedSales.sort((a, b) => {
            const dateDiff = new Date(b.date) - new Date(a.date);
            if (dateDiff !== 0) return dateDiff;
            return (b.id || '').localeCompare(a.id || '');
        });

        // Pagination
        const totalPages = Math.ceil(groupedSales.length / this.pageSize);
        const currentPage = this.pages.sales || 1;
        const startIndex = (currentPage - 1) * this.pageSize;
        const pageData = groupedSales.slice(startIndex, startIndex + this.pageSize);

        tbody.innerHTML = pageData.map(order => {
            const customerName = customerMap.get(order.customer_id) || '未知客戶';
            
            const detailRowsHtml = order.items.map(item => {
                const productName = productMap.get(item.product_id) || '未知產品';
                return `
                    <tr>
                        <td>${item.product_id || ''}</td>
                        <td>${productName}</td>
                        <td>$${Number(item.price || 0).toLocaleString()}</td>
                        <td>${item.qty || 0}</td>
                        <td><strong>$${Number(item.total || 0).toLocaleString()}</strong></td>
                    </tr>
                `;
            }).join('');

            return `
                <tr class="main-order-row" style="cursor: pointer;" onclick="app.toggleOrderDetail('${order.id}')">
                    <td class="text-center" id="arrow-${order.id}">
                        <i class="ph ph-caret-right" style="transition: transform 0.2s; font-size: 1.1rem; color: var(--primary);"></i>
                    </td>
                    <td><strong>${order.id}</strong></td>
                    <td>${order.date || ''}</td>
                    <td>${order.customer_id || ''}</td>
                    <td>${customerName}</td>
                    <td>${order.items.length}</td>
                    <td><span style="color: var(--primary); font-weight: 600;">$${Number(order.total || 0).toLocaleString()}</span></td>
                </tr>
                <tr class="detail-row" id="detail-row-${order.id}" style="display: none; background: rgba(0,0,0,0.01);">
                    <td></td>
                    <td colspan="6">
                        <div style="padding: 12px 18px; border-left: 3px solid var(--primary); background: rgba(0,0,0,0.005); border-radius: 0 8px 8px 0; margin: 4px 0 10px 0;">
                            <h5 style="margin: 0 0 10px 0; font-size: 0.85rem; color: var(--text-muted);">
                                <i class="ph ph-list-bullets"></i> 出貨品項明細
                            </h5>
                            <table class="data-table" style="margin: 0; width: 100%; box-shadow: none; font-size: 0.85rem;">
                                <thead>
                                    <tr>
                                        <th>產品代碼</th>
                                        <th>品項名稱</th>
                                        <th>售價單價</th>
                                        <th>數量</th>
                                        <th>小計</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${detailRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        this.renderPaginationControls('sales', totalPages, paginationDiv);
    },

    toggleOrderDetail(orderId) {
        const detailRow = document.getElementById(`detail-row-${orderId}`);
        const arrowTd = document.getElementById(`arrow-${orderId}`);
        if (detailRow && arrowTd) {
            const isHidden = detailRow.style.display === 'none';
            detailRow.style.display = isHidden ? 'table-row' : 'none';
            
            const icon = arrowTd.querySelector('i');
            if (icon) {
                icon.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
            }
        }
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
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">尚無廠商資料。</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${item.id || ''}</td>
                <td><strong>${item.name || ''}</strong></td>
                <td class="text-muted" style="font-size:0.85em">${item.full_name || ''}</td>
                <td>${item.contact || ''}</td>
                <td>${item.phone || item.mobile || ''}</td>
                <td>${item.email || ''}</td>
            </tr>
        `).join('');
    },

    async renderCustomers() {
        const data = await DB.getAll('customers');
        const tbody = document.getElementById('customers-tbody');
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">尚無客戶資料。</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${item.id || ''}</td>
                <td>
                    <strong>${item.name || ''}</strong>
                    ${item.english_name ? `<span class="text-muted" style="font-size:0.82em;display:block">${item.english_name}</span>` : ''}
                </td>
                <td>${item.phone || ''}</td>
                <td>${item.address || ''}</td>
                <td>${item.salesperson || ''}</td>
                <td>${item.email || ''}</td>
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
                    { data: 'unit', type: 'text' },
                    { data: 'supplier_id', type: 'text' }
                ];
                headers = ["產品代碼", "產品名稱", "產品類別", "進貨成本", "預計售價", "庫存量", "單位", "供應商ID"];
            } else if (tableName === 'suppliers') {
                columns = [
                    { data: 'id' }, { data: 'name' }, { data: 'full_name' },
                    { data: 'contact' }, { data: 'phone' }, { data: 'mobile' },
                    { data: 'tax_id' }, { data: 'email' }, { data: 'fax' },
                    { data: 'zip_code' }, { data: 'address' }, { data: 'remark' }
                ];
                headers = ["廠商編號", "廠商名稱", "廠商全名", "聯絡人", "電話", "手機", "統一編號", "Email", "傳真", "郵遞區號", "地址", "備註"];
            } else if (tableName === 'customers') {
                columns = [
                    { data: 'id' }, { data: 'name' }, { data: 'phone' }, { data: 'address' },
                    { data: 'english_name' }, { data: 'salesperson' }, { data: 'birthday' },
                    { data: 'gender' }, { data: 'email' }, { data: 'tax_id' },
                    { data: 'invoice_title' }, { data: 'vip_card' }, { data: 'member_card' },
                    { data: 'store_value_id' }, { data: 'customer_type' }, { data: 'fax' },
                    { data: 'zip_code' }, { data: 'remarks' }
                ];
                headers = ["客戶編號", "客戶名稱", "電話", "地址", "英文姓名", "服務員", "生日",
                    "性別", "電子郵件", "統一編號", "發票抬頭", "貴賓卡號", "會員卡號",
                    "儲值號碼", "身份類別", "傳真", "郵遞區號", "備註"];
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
                const row = Object.keys(mapping).map(k => item[k] !== undefined ? item[k] : '');
                aoa.push(row);
            });
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        };

        await mapToSheet('products', '商品庫存', {
            id: "產品代碼", name: "產品名稱", category: "產品類別",
            cost: "進貨成本", price: "預計售價", stock: "庫存量",
            unit: "單位", supplier_id: "供應商ID"
        });
        await mapToSheet('suppliers', '進貨廠商', {
            id: "廠商編號", name: "廠商名稱", full_name: "廠商全名",
            contact: "聯絡人", tax_id: "統一編號", phone: "電話",
            mobile: "手機", fax: "傳真", zip_code: "郵遞區號",
            address: "地址", remark: "備註", email: "Email"
        });
        await mapToSheet('customers', '客戶資料', {
            id: "客戶編號", name: "客戶名稱", phone: "電話", address: "地址",
            english_name: "英文姓名", salesperson: "服務員", birthday: "生日",
            gender: "性別", email: "電子郵件", tax_id: "統一編號",
            invoice_title: "發票抬頭", vip_card: "貴賓卡號", member_card: "會員卡號",
            store_value_id: "儲值號碼", customer_type: "身份類別",
            fax: "傳真", zip_code: "郵遞區號", remarks: "備註"
        });
        await mapToSheet('purchases', '進貨紀錄', {
            id: "進貨單號", date: "日期", supplier_id: "廠商編號",
            product_id: "產品代碼", cost: "單位成本", qty: "數量", total: "總金額"
        });
        await mapToSheet('sales', '出貨紀錄', {
            id: "出貨單號", date: "日期", customer_id: "客戶編號",
            product_id: "產品代碼", price: "售價單價", qty: "數量", total: "總金額",
            employee: "打單人員", discount: "銷貨折扣", shipping: "運費收入",
            cost: "商品成本", profit: "商品毛利", tax: "稅額", net_total: "商品總額"
        });

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
                    await processSheet('商品庫存', 'products', {
                        id: "產品代碼", name: "產品名稱", category: "產品類別",
                        cost: "進貨成本", price: "預計售價", stock: "庫存量",
                        unit: "單位", supplier_id: "供應商ID"
                    });
                    await processSheet('進貨廠商', 'suppliers', {
                        id: "廠商編號", name: "廠商名稱", full_name: "廠商全名",
                        contact: "聯絡人", tax_id: "統一編號", phone: "電話",
                        mobile: "手機", fax: "傳真", zip_code: "郵遞區號",
                        address: "地址", remark: "備註", email: "Email"
                    });
                    await processSheet('客戶資料', 'customers', {
                        id: "客戶編號", name: "客戶名稱", phone: "電話", address: "地址",
                        english_name: "英文姓名", salesperson: "服務員", birthday: "生日",
                        gender: "性別", email: "電子郵件", tax_id: "統一編號",
                        invoice_title: "發票抬頭", vip_card: "貴賓卡號", member_card: "會員卡號",
                        store_value_id: "儲值號碼", customer_type: "身份類別",
                        fax: "傳真", zip_code: "郵遞區號", remarks: "備註"
                    });
                    await processSheet('進貨紀錄', 'purchases', {
                        id: "進貨單號", date: "日期", supplier_id: "廠商編號",
                        product_id: "產品代碼", cost: "單位成本", qty: "數量", total: "總金額"
                    });
                    await processSheet('出貨紀錄', 'sales', {
                        id: "出貨單號", date: "日期", customer_id: "客戶編號",
                        product_id: "產品代碼", price: "售價單價", qty: "數量", total: "總金額",
                        employee: "打單人員", discount: "銷貨折扣", shipping: "運費收入",
                        cost: "商品成本", profit: "商品毛利", tax: "稅額", net_total: "商品總額"
                    });
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

    // --- Settings 頁面渲染（含一鍵匯入舊資料） ---
    async renderSettings() {
        const container = document.getElementById('settings-import-container');
        if (!container) return;

        // 判斷是否已載入 converted-data.js
        if (typeof ConvertedData === 'undefined') {
            container.innerHTML = `
                <div style="color: var(--text-muted); font-size: 0.9rem; margin-top: 12px;">
                    <i class="ph ph-info"></i>
                    若要一鍵匯入舊系統資料，請先在 index.html 中加入<br>
                    <code style="background:rgba(0,0,0,0.05);padding:2px 6px;border-radius:4px;">&lt;script src="js/converted-data.js"&gt;&lt;/script&gt;</code>
                    後重新整理頁面。
                </div>`;
            return;
        }

        const p = (ConvertedData.products || []).length;
        const s = (ConvertedData.suppliers || []).length;
        const c = (ConvertedData.customers || []).length;
        const sa = (ConvertedData.sales || []).length;

        container.innerHTML = `
            <div class="converted-import-panel" style="margin-top:24px;padding:20px;border:1px solid rgba(79,70,229,0.3);border-radius:12px;background:rgba(79,70,229,0.04);">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                    <i class="ph ph-file-xls" style="font-size:1.5rem;color:var(--primary);"></i>
                    <h4 style="margin:0;color:var(--primary);">一鍵匯入舊系統資料</h4>
                </div>
                <p style="font-size:0.9rem;color:var(--text-muted);margin-bottom:16px;">
                    已偵測到已轉換的舊系統資料：
                    商品 <strong>${p}</strong> 筆、廠商 <strong>${s}</strong> 筆、
                    客戶 <strong>${c}</strong> 筆、出貨紀錄 <strong>${sa}</strong> 筆。
                </p>
                <div style="display:flex;gap:10px;">
                    <button class="btn btn-primary" id="btn-do-converted-import">
                        <i class="ph ph-upload-simple"></i> 立即匯入
                    </button>
                    <button class="btn btn-outline" onclick="app.navigate('dashboard')">
                        <i class="ph ph-chart-bar"></i> 匯入後查看總覽
                    </button>
                </div>
                <div id="import-progress" style="margin-top:12px;font-size:0.85rem;color:var(--text-muted);"></div>
            </div>`;

        document.getElementById('btn-do-converted-import').onclick = async () => {
            const btn = document.getElementById('btn-do-converted-import');
            const progress = document.getElementById('import-progress');
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> 匯入中...';

            try {
                progress.textContent = '正在寫入商品資料...';
                await DB.bulkInsert('products', ConvertedData.products);

                progress.textContent = '正在寫入廠商資料...';
                await DB.bulkInsert('suppliers', ConvertedData.suppliers);

                progress.textContent = '正在寫入客戶資料...';
                await DB.bulkInsert('customers', ConvertedData.customers);

                progress.textContent = '正在寫入出貨紀錄...';
                await DB.bulkInsert('sales', ConvertedData.sales);

                progress.innerHTML = '<span style="color:var(--secondary)"><i class="ph ph-check-circle"></i> 匯入成功！所有舊系統資料已寫入本系統。</span>';
                btn.innerHTML = '<i class="ph ph-check"></i> 已匯入';
                this.showToast('舊系統資料匯入成功！');
            } catch (err) {
                console.error(err);
                progress.innerHTML = '<span style="color:var(--danger)">匯入發生錯誤，請查看 Console 詳細訊息。</span>';
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-upload-simple"></i> 重試';
            }
        };
    },

    // --- Modal Logic (Basic support for adding Product/Purchase/Sale) ---
    async showModal(type) {
        const overlay = document.getElementById('modal-container');
        const mTitle = document.getElementById('modal-title');
        const mBody = document.getElementById('modal-body');
        const mSave = document.getElementById('modal-save-btn');

        const modalEl = overlay.querySelector('.modal');
        if (modalEl) {
            if (type === 'purchase-modal' || type === 'sale-modal') {
                modalEl.classList.add('modal-lg');
            } else {
                modalEl.classList.remove('modal-lg');
            }
        }

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
                <div class="form-group"><label>單位</label><input type="text" id="m-unit" class="form-control" placeholder="例：件、雙、個"></div>
                <div class="form-group"><label>供應商ID</label><input type="text" id="m-supplier-id" class="form-control"></div>
            `;
            saveHandler = async () => {
                await DB.save('products', {
                    id: document.getElementById('m-id').value,
                    name: document.getElementById('m-name').value,
                    category: document.getElementById('m-category').value,
                    cost: document.getElementById('m-cost').value,
                    price: document.getElementById('m-price').value,
                    stock: document.getElementById('m-stock').value,
                    unit: document.getElementById('m-unit').value,
                    supplier_id: document.getElementById('m-supplier-id').value
                });
                return true;
            };
        } else if (type === 'purchase-modal') {
            mTitle.innerText = '新增進貨紀錄';
            const tid = this.generateID('P');
            const suppliers = await DB.getAll('suppliers');
            const products = await DB.getAll('products');

            const sOptions = suppliers.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join('');

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
                <div style="margin-top: 20px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <h4 style="margin: 0; font-size: 0.95rem; color: var(--primary-color);">採購明細</h4>
                    <button type="button" class="btn btn-sm btn-outline" id="m-add-item-btn">
                        <i class="ph ph-plus"></i> 新增品項
                    </button>
                </div>
                <div id="m-items-container" style="border-top: 1px solid rgba(0,0,0,0.08); padding-top: 15px; max-height: 250px; overflow-y: auto;">
                    <!-- 動態品項行會插入到這裡 -->
                </div>
            `;
            
            postRender = () => {
                const container = document.getElementById('m-items-container');
                const addBtn = document.getElementById('m-add-item-btn');
                const categories = [...new Set(products.map(p => p.category))].filter(Boolean).sort();
                const catOptions = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

                const addItemRow = () => {
                    const rowId = 'row-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                    const itemHtml = `
                        <div class="purchase-item-row" id="${rowId}" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; margin-bottom: 12px; border-bottom: 1px dashed rgba(0,0,0,0.05); padding-bottom: 10px;">
                            <div class="form-group" style="flex: 1.5; margin-bottom: 0; min-width: 120px;">
                                <label style="font-size: 0.75rem; margin-bottom: 4px;">產品類別</label>
                                <select class="form-control item-category" style="width: 100%;">
                                    <option value="">請選擇...</option>
                                    ${catOptions}
                                </select>
                            </div>
                            <div class="form-group" style="flex: 2; margin-bottom: 0; min-width: 150px;">
                                <label style="font-size: 0.75rem; margin-bottom: 4px;">產品項目</label>
                                <select class="form-control item-pid" required style="width: 100%;">
                                    <option value="">請先選擇類別</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex: 1; margin-bottom: 0; min-width: 70px;">
                                <label style="font-size: 0.75rem; margin-bottom: 4px;">數量</label>
                                <input type="number" class="form-control item-qty" value="1" min="1" required style="width: 100%;">
                            </div>
                            <div class="form-group" style="flex: 1; margin-bottom: 0; min-width: 80px;">
                                <label style="font-size: 0.75rem; margin-bottom: 4px;">單位成本</label>
                                <input type="number" class="form-control item-cost" required style="width: 100%;">
                            </div>
                            <button type="button" class="btn btn-outline" onclick="document.getElementById('${rowId}').remove()" style="margin-bottom: 0; padding: 8px; color: var(--danger); border-color: rgba(220,38,38,0.2); background: transparent; height: 38px;">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    `;
                    container.insertAdjacentHTML('beforeend', itemHtml);

                    const newRow = document.getElementById(rowId);
                    const catSel = newRow.querySelector('.item-category');
                    const pidSel = newRow.querySelector('.item-pid');
                    const costInp = newRow.querySelector('.item-cost');

                    catSel.onchange = () => {
                        const selectedCat = catSel.value;
                        const filtered = products.filter(p => p.category === selectedCat);
                        pidSel.innerHTML = '<option value="">請選擇產品...</option>' + 
                            filtered.map(p => `<option value="${p.id}" data-cost="${p.cost}">${p.name} (${p.id})</option>`).join('');
                    };

                    pidSel.onchange = () => {
                        const opt = pidSel.options[pidSel.selectedIndex];
                        if (opt && opt.value) {
                            costInp.value = opt.getAttribute('data-cost') || 0;
                        }
                    };
                };

                addBtn.onclick = () => addItemRow();
                addItemRow(); // 預設加一筆
            };

            saveHandler = async () => {
                const sid = document.getElementById('m-sid').value;
                const date = document.getElementById('m-date').value;
                const id = document.getElementById('m-id').value;
                
                if (!sid) { await this.alert('請選擇廠商'); return false; }
                
                const rows = document.querySelectorAll('.purchase-item-row');
                if (!rows.length) { await this.alert('請至少新增一個品項'); return false; }
                
                const items = [];
                for (const row of rows) {
                    const pid = row.querySelector('.item-pid').value;
                    const qty = Number(row.querySelector('.item-qty').value);
                    const cost = Number(row.querySelector('.item-cost').value);
                    
                    if (!pid) { await this.alert('請選擇所有品項的產品'); return false; }
                    if (qty <= 0) { await this.alert('數量必須大於 0'); return false; }
                    if (cost < 0) { await this.alert('單位成本不能小於 0'); return false; }
                    
                    items.push({ pid, qty, cost });
                }
                
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const subId = `${id}-${i+1}`;
                    await DB.save('purchases', {
                        id: subId,
                        date: date,
                        product_id: item.pid,
                        supplier_id: sid,
                        qty: item.qty,
                        cost: item.cost,
                        total: item.qty * item.cost
                    });
                    
                    const prod = await db.products.get(item.pid);
                    if (prod) {
                        prod.stock = Number(prod.stock || 0) + item.qty;
                        await DB.save('products', prod);
                    }
                }
                return true;
            };
        } else if (type === 'sale-modal') {
            mTitle.innerText = '新增出貨紀錄';
            const tid = this.generateID('S');
            const customers = await DB.getAll('customers');
            const products = await DB.getAll('products');

            html = `
                <div class="form-group"><label>出貨單號</label><input type="text" id="m-id" class="form-control" value="${tid}" readonly></div>
                <div class="form-group"><label>日期</label><input type="date" id="m-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}"></div>
                <div class="form-group" style="position: relative;">
                    <label>客戶</label>
                    <input type="text" id="m-cid-search" class="form-control" placeholder="輸入客戶姓名或編號搜尋..." autocomplete="off">
                    <input type="hidden" id="m-cid">
                    <div id="m-cid-dropdown" class="autocomplete-dropdown" style="display: none;"></div>
                </div>
                <div style="margin-top: 20px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <h4 style="margin: 0; font-size: 0.95rem; color: var(--primary-color);">出貨明細</h4>
                    <button type="button" class="btn btn-sm btn-outline" id="m-add-item-btn">
                        <i class="ph ph-plus"></i> 新增品項
                    </button>
                </div>
                <div id="m-items-container" style="border-top: 1px solid rgba(0,0,0,0.08); padding-top: 15px; max-height: 280px; overflow-y: auto;">
                    <!-- 動態品項行會插入到這裡 -->
                </div>
            `;

            postRender = () => {
                const container = document.getElementById('m-items-container');
                const addBtn = document.getElementById('m-add-item-btn');
                const categories = [...new Set(products.map(p => p.category))].filter(Boolean).sort();
                const catOptions = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

                const addItemRow = () => {
                    const rowId = 'row-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                    const itemHtml = `
                        <div class="sale-item-row" id="${rowId}" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; margin-bottom: 12px; border-bottom: 1px dashed rgba(0,0,0,0.05); padding-bottom: 10px;">
                            <div class="form-group" style="flex: 1.5; margin-bottom: 0; min-width: 120px;">
                                <label style="font-size: 0.75rem; margin-bottom: 4px;">產品類別</label>
                                <select class="form-control item-category" style="width: 100%;">
                                    <option value="">請選擇...</option>
                                    ${catOptions}
                                </select>
                            </div>
                            <div class="form-group" style="flex: 2; margin-bottom: 0; min-width: 150px;">
                                <label style="font-size: 0.75rem; margin-bottom: 4px;">產品項目 <span class="item-stock-info" style="color: var(--primary); font-weight: 600; margin-left: 5px;"></span></label>
                                <select class="form-control item-pid" required style="width: 100%;">
                                    <option value="">請先選擇類別</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex: 1; margin-bottom: 0; min-width: 70px;">
                                <label style="font-size: 0.75rem; margin-bottom: 4px;">數量</label>
                                <input type="number" class="form-control item-qty" value="1" min="1" required style="width: 100%;">
                            </div>
                            <div class="form-group" style="flex: 1; margin-bottom: 0; min-width: 80px;">
                                <label style="font-size: 0.75rem; margin-bottom: 4px;">售價單價</label>
                                <input type="number" class="form-control item-price" required style="width: 100%;">
                            </div>
                            <button type="button" class="btn btn-outline" onclick="document.getElementById('${rowId}').remove()" style="margin-bottom: 0; padding: 8px; color: var(--danger); border-color: rgba(220,38,38,0.2); background: transparent; height: 38px;">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    `;
                    container.insertAdjacentHTML('beforeend', itemHtml);

                    const newRow = document.getElementById(rowId);
                    const catSel = newRow.querySelector('.item-category');
                    const pidSel = newRow.querySelector('.item-pid');
                    const qtyInp = newRow.querySelector('.item-qty');
                    const priceInp = newRow.querySelector('.item-price');
                    const stockInfo = newRow.querySelector('.item-stock-info');

                    catSel.onchange = () => {
                        const selectedCat = catSel.value;
                        const filtered = products.filter(p => p.category === selectedCat);
                        pidSel.innerHTML = '<option value="">請選擇產品...</option>' + 
                            filtered.map(p => `<option value="${p.id}" data-price="${p.price}" data-stock="${p.stock}">${p.name} (${p.id})</option>`).join('');
                        stockInfo.innerText = '';
                    };

                    pidSel.onchange = () => {
                        const opt = pidSel.options[pidSel.selectedIndex];
                        if (opt && opt.value) {
                            const stock = Number(opt.getAttribute('data-stock') || 0);
                            priceInp.value = opt.getAttribute('data-price') || 0;
                            stockInfo.innerText = `(庫存: ${stock})`;
                            qtyInp.max = stock;
                            if (Number(qtyInp.value) > stock) qtyInp.value = stock;
                        } else {
                            stockInfo.innerText = '';
                        }
                    };
                };

                addBtn.onclick = () => addItemRow();
                addItemRow(); // 預設加一筆

                // Autocomplete for Customer search
                const cidSearch = document.getElementById('m-cid-search');
                const cidHidden = document.getElementById('m-cid');
                const cidDropdown = document.getElementById('m-cid-dropdown');

                cidSearch.oninput = (e) => {
                    const query = e.target.value.trim().toLowerCase();
                    if (query.length < 1) {
                        cidDropdown.style.display = 'none';
                        cidHidden.value = '';
                        return;
                    }

                    const filtered = customers.filter(c => 
                        (c.name && c.name.toLowerCase().includes(query)) || 
                        (c.id && c.id.toLowerCase().includes(query))
                    );

                    if (filtered.length === 0) {
                        cidDropdown.innerHTML = '<div style="padding: 8px 12px; color: var(--text-muted); font-size: 0.85rem;">找不到相符的客戶</div>';
                    } else {
                        cidDropdown.innerHTML = filtered.map(c => `
                            <div class="autocomplete-item" data-id="${c.id}" data-name="${c.name}">
                                <strong>${c.name}</strong> <span style="font-size: 0.8rem; color: var(--text-muted);">(${c.id})</span>
                            </div>
                        `).join('');

                        cidDropdown.querySelectorAll('.autocomplete-item').forEach(item => {
                            item.onclick = () => {
                                const cid = item.getAttribute('data-id');
                                const name = item.getAttribute('data-name');
                                cidSearch.value = `${name} (${cid})`;
                                cidHidden.value = cid;
                                cidDropdown.style.display = 'none';
                            };
                        });
                    }
                    cidDropdown.style.display = 'block';
                };

                // Dismiss dropdown on outside clicks
                document.addEventListener('click', (e) => {
                    if (cidSearch && cidDropdown && e.target !== cidSearch && !cidDropdown.contains(e.target)) {
                        cidDropdown.style.display = 'none';
                    }
                });
            };

            saveHandler = async () => {
                const cid = document.getElementById('m-cid').value;
                const date = document.getElementById('m-date').value;
                const id = document.getElementById('m-id').value;
                
                if (!cid) { await this.alert('請選擇客戶'); return false; }
                
                const rows = document.querySelectorAll('.sale-item-row');
                if (!rows.length) { await this.alert('請至少新增一個品項'); return false; }
                
                const items = [];
                const productQtySummary = {};
                
                for (const row of rows) {
                    const pid = row.querySelector('.item-pid').value;
                    const qty = Number(row.querySelector('.item-qty').value);
                    const price = Number(row.querySelector('.item-price').value);
                    
                    if (!pid) { await this.alert('請選擇所有品項的產品'); return false; }
                    if (qty <= 0) { await this.alert('數量必須大於 0'); return false; }
                    if (price < 0) { await this.alert('售價單價不能小於 0'); return false; }
                    
                    items.push({ pid, qty, price });
                    productQtySummary[pid] = (productQtySummary[pid] || 0) + qty;
                }
                
                // 檢查庫存量 (合併加總後)
                for (const pid in productQtySummary) {
                    const prod = await db.products.get(pid);
                    const totalQty = productQtySummary[pid];
                    if (!prod || prod.stock < totalQty) {
                        await this.alert(`庫存不足！商品「${prod ? prod.name : pid}」的目前庫存僅剩 ${prod ? prod.stock : 0}，但您的出貨總量為 ${totalQty}`);
                        return false;
                    }
                }
                
                // 儲存與更新庫存
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const subId = `${id}-${i+1}`;
                    await DB.save('sales', {
                        id: subId,
                        date: date,
                        customer_id: cid,
                        product_id: item.pid,
                        qty: item.qty,
                        price: item.price,
                        total: item.qty * item.price
                    });
                    
                    const prod = await db.products.get(item.pid);
                    if (prod) {
                        prod.stock = Number(prod.stock || 0) - item.qty;
                        await DB.save('products', prod);
                    }
                }
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
