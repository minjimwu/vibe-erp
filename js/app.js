// Core Application Logic
const app = {
    currentView: '',
    chartInstance: null,
    pages: { purchases: 1, sales: 1 },
    pageSize: 10,

    // --- 核心變更歷程 (Audit Log) 記錄方法 ---
    async addAuditLog(action, targetType, targetId, description, oldVal = null, newVal = null) {
        let changedFields = null;
        if (action === 'UPDATE' && oldVal && newVal) {
            changedFields = {};
            const keys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);
            for (const key of keys) {
                if (key === 'id') continue; // 忽略主鍵
                const oldStr = JSON.stringify(oldVal[key]);
                const newStr = JSON.stringify(newVal[key]);
                if (oldStr !== newStr) {
                    changedFields[key] = {
                        old: oldVal[key],
                        new: newVal[key]
                    };
                }
            }
            if (Object.keys(changedFields).length === 0) {
                changedFields = null;
            }
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            action: action,
            target_type: targetType,
            target_id: targetId,
            description: description,
            details: changedFields ? { changed_fields: changedFields } : (oldVal || newVal ? { value: oldVal || newVal } : null),
            operator: '系統管理員'
        };
        await db.audit_logs.put(logEntry);
    },

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
            'logs': '系統日誌 Audit Logs',
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
                case 'logs': await this.renderLogs(); break;
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
        const [data, purchases, sales, suppliers, customers] = await Promise.all([
            DB.getAll('products'),
            DB.getAll('purchases'),
            DB.getAll('sales'),
            DB.getAll('suppliers'),
            DB.getAll('customers')
        ]);
        const tbody = document.getElementById('products-tbody');
        const filterSel = document.getElementById('product-category-filter');

        const supplierMap = new Map(suppliers.map(s => [s.id, s.name]));
        const customerMap = new Map(customers.map(c => [c.id, c.name]));

        const productPurchasesMap = new Map();
        purchases.forEach(p => {
            if (!productPurchasesMap.has(p.product_id)) {
                productPurchasesMap.set(p.product_id, []);
            }
            productPurchasesMap.get(p.product_id).push(p);
        });

        const productSalesMap = new Map();
        sales.forEach(s => {
            if (!productSalesMap.has(s.product_id)) {
                productSalesMap.set(s.product_id, []);
            }
            productSalesMap.get(s.product_id).push(s);
        });

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
                ? `<tr><td colspan="10" class="text-center">尚無符合類別「${filterVal}」的商品。</td></tr>`
                : '<tr><td colspan="10" class="text-center">尚無資料，請先新增或匯入 Excel 檔案。</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.map(item => {
            const itemPurchases = productPurchasesMap.get(item.id) || [];
            // Sort by Date DESC
            itemPurchases.sort((a, b) => new Date(b.date) - new Date(a.date));

            const itemSales = productSalesMap.get(item.id) || [];
            // Sort by Date DESC
            itemSales.sort((a, b) => new Date(b.date) - new Date(a.date));

            // Calculate unique purchase order count
            const orderIds = new Set(itemPurchases.map(p => (p.id || '').split('-')[0]));
            const purchaseOrderCount = orderIds.size;

            // Calculate unique sales order count
            const salesOrderIds = new Set(itemSales.map(s => (s.id || '').split('-')[0]));
            const salesOrderCount = salesOrderIds.size;

            // Calculate weighted average unit cost
            let totalCostSum = 0;
            let totalQtySum = 0;
            itemPurchases.forEach(p => {
                totalCostSum += Number(p.total || 0);
                totalQtySum += Number(p.qty || 0);
            });
            const avgUnitCost = totalQtySum > 0 ? (totalCostSum / totalQtySum) : Number(item.cost || 0);

            const detailRowsHtml = itemPurchases.length > 0 
                ? itemPurchases.map(p => {
                    const orderId = (p.id || '').split('-')[0];
                    const supplierName = supplierMap.get(p.supplier_id) || '未知廠商';
                    return `
                        <tr>
                            <td>${orderId}</td>
                            <td>${p.date || ''}</td>
                            <td>${p.supplier_id ? `${p.supplier_id} (${supplierName})` : '未知廠商'}</td>
                            <td>$${Number(p.cost || 0).toLocaleString()}</td>
                            <td>${p.qty || 0}</td>
                            <td><strong>$${Number(p.total || 0).toLocaleString()}</strong></td>
                        </tr>
                    `;
                  }).join('')
                : `<tr><td colspan="6" class="text-center" style="color: var(--text-muted);">尚無此商品的進貨記錄。</td></tr>`;

            const salesDetailRowsHtml = itemSales.length > 0 
                ? itemSales.map(s => {
                    const orderId = (s.id || '').split('-')[0];
                    const customerName = customerMap.get(s.customer_id) || '未知客戶';
                    return `
                        <tr>
                            <td>${orderId}</td>
                            <td>${s.date || ''}</td>
                            <td>${s.customer_id ? `${s.customer_id} (${customerName})` : '未知客戶'}</td>
                            <td>$${Number(s.price || 0).toLocaleString()}</td>
                            <td>${s.qty || 0}</td>
                            <td><strong>$${Number(s.total || 0).toLocaleString()}</strong></td>
                        </tr>
                    `;
                  }).join('')
                : `<tr><td colspan="6" class="text-center" style="color: var(--text-muted);">尚無此商品的出貨記錄。</td></tr>`;

            return `
                <tr class="main-order-row" style="cursor: pointer;" onclick="app.toggleOrderDetail('${item.id}')">
                    <td class="text-center" id="arrow-${item.id}">
                        <i class="ph ph-caret-right" style="transition: transform 0.2s; font-size: 1.1rem; color: var(--primary);"></i>
                    </td>
                    <td>${item.id || ''}</td>
                    <td><span class="category-badge">${item.category || ''}</span></td>
                    <td><strong>${item.name || ''}</strong></td>
                    <td>$${Number(avgUnitCost.toFixed(2)).toLocaleString()}</td>
                    <td>$${Number(item.price || 0).toLocaleString()}</td>
                    <td><span style="color: ${Number(item.stock) < 10 ? 'var(--danger)' : 'inherit'}">${item.stock || 0}</span></td>
                    <td>${purchaseOrderCount}</td>
                    <td>${salesOrderCount}</td>
                    <td onclick="event.stopPropagation();">
                        <button class="btn btn-sm btn-outline" style="margin-right: 4px;" onclick="app.showModal('product-modal', '${item.id}')">修改</button>
                        <button class="btn btn-sm btn-outline btn-danger" style="color: var(--danger); border-color: rgba(220,38,38,0.2);" onclick="app.deleteRecord('products', '${item.id}')">刪除</button>
                    </td>
                </tr>
                <tr class="detail-row" id="detail-row-${item.id}" style="display: none; background: rgba(0,0,0,0.01);">
                    <td></td>
                    <td colspan="9">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 4px 0 10px 0;">
                            <!-- 左欄：進貨歷史記錄 -->
                            <div style="padding: 12px 18px; border-left: 3px solid var(--primary); background: rgba(0,0,0,0.005); border-radius: 0 8px 8px 0;">
                                <h5 style="margin: 0 0 10px 0; font-size: 0.85rem; color: var(--text-muted);">
                                    <i class="ph ph-clock-counter-clockwise"></i> 商品進貨歷史記錄
                                </h5>
                                <table class="data-table" style="margin: 0; width: 100%; box-shadow: none; font-size: 0.85rem;">
                                    <thead>
                                        <tr>
                                            <th>進貨單號</th>
                                            <th>進貨日期</th>
                                            <th>廠商</th>
                                            <th>進貨成本</th>
                                            <th>數量</th>
                                            <th>小計</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${detailRowsHtml}
                                    </tbody>
                                </table>
                            </div>
                            
                            <!-- 右欄：出貨歷史記錄 -->
                            <div style="padding: 12px 18px; border-left: 3px solid var(--success, #10b981); background: rgba(0,0,0,0.005); border-radius: 0 8px 8px 0;">
                                <h5 style="margin: 0 0 10px 0; font-size: 0.85rem; color: var(--text-muted);">
                                    <i class="ph ph-trend-up"></i> 商品出貨歷史記錄
                                </h5>
                                <table class="data-table" style="margin: 0; width: 100%; box-shadow: none; font-size: 0.85rem;">
                                    <thead>
                                        <tr>
                                            <th>出貨單號</th>
                                            <th>出貨日期</th>
                                            <th>客戶</th>
                                            <th>售價</th>
                                            <th>數量</th>
                                            <th>小計</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${salesDetailRowsHtml}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
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
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">尚無進貨資料。</td></tr>';
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
                    <td class="text-center" style="white-space: nowrap;">
                        <button class="btn btn-sm btn-outline" style="padding: 4px 8px; margin-right: 4px;" onclick="event.stopPropagation(); app.showModal('purchase-modal', '${order.id}')">
                            <i class="ph ph-pencil-simple"></i> 編輯
                        </button>
                        <button class="btn btn-sm btn-outline btn-danger" style="padding: 4px 8px; color: var(--danger); border-color: rgba(220,38,38,0.2);" onclick="event.stopPropagation(); app.deletePurchaseOrder('${order.id}')">
                            <i class="ph ph-trash"></i> 刪除
                        </button>
                    </td>
                </tr>
                <tr class="detail-row" id="detail-row-${order.id}" style="display: none; background: rgba(0,0,0,0.01);">
                    <td></td>
                    <td colspan="7">
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
                    <td class="text-center" style="white-space: nowrap;">
                        <button class="btn btn-sm btn-outline" style="padding: 4px 8px; margin-right: 4px;" onclick="event.stopPropagation(); app.showModal('sale-modal', '${order.id}')">
                            <i class="ph ph-pencil-simple"></i> 編輯
                        </button>
                        <button class="btn btn-sm btn-outline btn-danger" style="padding: 4px 8px; color: var(--danger); border-color: rgba(220,38,38,0.2);" onclick="event.stopPropagation(); app.deleteSalesOrder('${order.id}')">
                            <i class="ph ph-trash"></i> 刪除
                        </button>
                    </td>
                </tr>
                <tr class="detail-row" id="detail-row-${order.id}" style="display: none; background: rgba(0,0,0,0.01);">
                    <td></td>
                    <td colspan="7">
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

    async deleteSalesOrder(orderId) {
        // 1. 取得該單號所有原出貨紀錄
        const existingItems = await db.sales.where('id').startsWith(orderId).toArray();
        if (!existingItems.length) {
            await this.alert('找不到此出貨單的明細紀錄');
            return;
        }

        // 2. 獲取所有相關產品的資料，計算庫存變動
        const products = await DB.getAll('products');
        const productMap = new Map(products.map(p => [p.id, p]));
        
        // 3. 準備變動摘要
        let summaryRowsHtml = '';
        const itemsToUpdate = []; // { prod, qtyToReturn }
        
        for (const item of existingItems) {
            const prod = productMap.get(item.product_id);
            const currentStock = prod ? Number(prod.stock || 0) : 0;
            const change = item.qty; // 刪除出貨單，庫存回補 +qty
            const estStock = currentStock + change;
            const prodName = prod ? prod.name : item.product_id;
            
            summaryRowsHtml += `
                <tr>
                    <td>${prodName} (${item.product_id})</td>
                    <td>${currentStock}</td>
                    <td style="color: var(--primary); font-weight: bold;">+${change}</td>
                    <td>${estStock}</td>
                </tr>
            `;
            
            itemsToUpdate.push({
                pid: item.product_id,
                qtyToReturn: change
            });
        }
        
        const summaryHtml = `
            <div style="text-align: left;">
                <p>確定要刪除出貨單 <strong>${orderId}</strong> 嗎？此操作將會刪除該單所有出貨紀錄，並恢復商品庫存：</p>
                <table class="data-table" style="width: 100%; margin-top: 12px; font-size: 0.85rem; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="text-align: left; padding: 6px;">產品名稱</th>
                            <th style="text-align: left; padding: 6px;">目前庫存</th>
                            <th style="text-align: left; padding: 6px;">本次回補</th>
                            <th style="text-align: left; padding: 6px;">回補後預估庫存</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${summaryRowsHtml}
                    </tbody>
                </table>
                <p style="margin-top: 12px; color: var(--danger); font-size: 0.85rem; font-weight: bold;">警告：此操作無法復原！</p>
            </div>
        `;
        
        const confirmed = await this.confirm(summaryHtml, '確認刪除出貨單');
        if (!confirmed) return;
        
        try {
            await db.transaction('rw', db.products, db.sales, db.customers, db.audit_logs, async () => {
                // 刪除出貨紀錄
                await db.sales.where('id').startsWith(orderId).delete();
                
                // 回補庫存
                for (const item of itemsToUpdate) {
                    const prod = await db.products.get(item.pid);
                    if (prod) {
                        prod.stock = Number(prod.stock || 0) + item.qtyToReturn;
                        await db.products.put(prod);
                    }
                }
                
                const cid = existingItems[0]?.customer_id;
                const customer = cid ? await db.customers.get(cid) : null;
                const customerName = customer ? customer.name : cid;

                const enrichedItems = await Promise.all(existingItems.map(async it => {
                    const prod = await db.products.get(it.product_id);
                    return {
                        ...it,
                        product_name: prod ? prod.name : '未知產品'
                    };
                }));

                const logOld = { customer_id: cid, customer_name: customerName, items: enrichedItems };
                await this.addAuditLog('DELETE', 'sale', orderId, `刪除出貨單 ${orderId}`, logOld, null);
            });
            
            this.showToast('刪除成功');
            // 重新渲染出貨管理與 Dashboard 頁面
            this.navigate(this.currentView);
        } catch (err) {
            console.error(err);
            await this.alert('刪除失敗：' + err.message);
        }
    },

    async deletePurchaseOrder(orderId) {
        // 1. 取得該單號所有原進貨紀錄
        const existingItems = await db.purchases.where('id').startsWith(orderId).toArray();
        if (!existingItems.length) {
            await this.alert('找不到此進貨單的明細紀錄');
            return;
        }

        // 2. 獲取所有相關產品的資料，計算庫存變動
        const products = await DB.getAll('products');
        const productMap = new Map(products.map(p => [p.id, p]));
        
        // 3. 準備變動摘要，並檢查扣回時是否會導致庫存不足
        let summaryRowsHtml = '';
        const itemsToUpdate = []; // { pid, qtyToDeduct }
        
        for (const item of existingItems) {
            const prod = productMap.get(item.product_id);
            const currentStock = prod ? Number(prod.stock || 0) : 0;
            const change = item.qty; // 刪除進貨單，庫存扣回 -qty
            const estStock = currentStock - change;
            const prodName = prod ? prod.name : item.product_id;
            
            if (estStock < 0) {
                await this.alert(`無法刪除進貨單！商品「${prodName}」目前庫存為 ${currentStock}，扣回本單的採購數量 ${change} 後將導致庫存不足（預計為 ${estStock}）`);
                return;
            }

            summaryRowsHtml += `
                <tr>
                    <td>${prodName} (${item.product_id})</td>
                    <td>${currentStock}</td>
                    <td style="color: var(--danger); font-weight: bold;">-${change}</td>
                    <td>${estStock}</td>
                </tr>
            `;
            
            itemsToUpdate.push({
                pid: item.product_id,
                qtyToDeduct: change
            });
        }
        
        const summaryHtml = `
            <div style="text-align: left;">
                <p>確定要刪除進貨單 <strong>${orderId}</strong> 嗎？此操作將會刪除該單所有採購紀錄，並扣除已進貨的商品庫存：</p>
                <table class="data-table" style="width: 100%; margin-top: 12px; font-size: 0.85rem; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="text-align: left; padding: 6px;">產品名稱</th>
                            <th style="text-align: left; padding: 6px;">目前庫存</th>
                            <th style="text-align: left; padding: 6px;">本次扣除</th>
                            <th style="text-align: left; padding: 6px;">扣除後預估庫存</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${summaryRowsHtml}
                    </tbody>
                </table>
                <p style="margin-top: 12px; color: var(--danger); font-size: 0.85rem; font-weight: bold;">警告：此操作無法復原！</p>
            </div>
        `;
        
        const confirmed = await this.confirm(summaryHtml, '確認刪除進貨單');
        if (!confirmed) return;
        
        try {
            await db.transaction('rw', db.products, db.purchases, db.suppliers, db.audit_logs, async () => {
                // 刪除進貨紀錄
                await db.purchases.where('id').startsWith(orderId).delete();
                
                // 扣減庫存
                for (const item of itemsToUpdate) {
                    const prod = await db.products.get(item.pid);
                    if (prod) {
                        prod.stock = Number(prod.stock || 0) - item.qtyToDeduct;
                        await db.products.put(prod);
                    }
                }
                
                const sid = existingItems[0]?.supplier_id;
                const supplier = sid ? await db.suppliers.get(sid) : null;
                const supplierName = supplier ? supplier.name : sid;

                const enrichedItems = await Promise.all(existingItems.map(async it => {
                    const prod = await db.products.get(it.product_id);
                    return {
                        ...it,
                        product_name: prod ? prod.name : '未知產品'
                    };
                }));

                const logOld = { supplier_id: sid, supplier_name: supplierName, items: enrichedItems };
                await this.addAuditLog('DELETE', 'purchase', orderId, `刪除進貨單 ${orderId}`, logOld, null);
            });
            
            this.showToast('刪除成功');
            // 重新渲染進貨管理與 Dashboard 頁面
            this.navigate(this.currentView);
        } catch (err) {
            console.error(err);
            await this.alert('刪除失敗：' + err.message);
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
        const searchInput = document.getElementById('supplier-search');
        if (!tbody) return;

        const renderFiltered = () => {
            const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
            const filtered = query ? data.filter(item => 
                (item.id || '').toLowerCase().includes(query) ||
                (item.name || '').toLowerCase().includes(query) ||
                (item.full_name || '').toLowerCase().includes(query) ||
                (item.contact || '').toLowerCase().includes(query) ||
                (item.phone || '').toLowerCase().includes(query) ||
                (item.mobile || '').toLowerCase().includes(query) ||
                (item.email || '').toLowerCase().includes(query)
            ) : data;

            if (!filtered.length) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 20px;">尚無符合篩選條件的廠商資料。</td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map(item => `
                <tr class="main-order-row" style="cursor: pointer;" onclick="app.toggleOrderDetail('${item.id}')">
                    <td id="arrow-${item.id}" style="text-align: center; font-size: 0.8rem; transition: transform 0.2s;"><i class="ph ph-caret-right"></i></td>
                    <td>${item.id || ''}</td>
                    <td><strong>${item.name || ''}</strong></td>
                    <td class="text-muted" style="font-size:0.85em">${item.full_name || ''}</td>
                    <td>${item.contact || ''}</td>
                    <td>${item.phone || item.mobile || ''}</td>
                    <td>${item.email || ''}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" style="padding: 2px 6px; font-size: 0.8rem; margin-right: 4px;" onclick="event.stopPropagation(); app.showModal('supplier-modal', '${item.id}')">修改</button>
                        <button class="btn btn-sm btn-outline" style="padding: 2px 6px; font-size: 0.8rem;" onclick="event.stopPropagation(); app.deleteRecord('suppliers', '${item.id}')">刪除</button>
                    </td>
                </tr>
                <tr id="detail-row-${item.id}" class="detail-row" style="display: none; background: rgba(0,0,0,0.01);">
                    <td colspan="8" style="padding: 12px 20px;">
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 0.88rem; text-align: left; color: var(--text-muted);">
                            <div><strong>廠商全名：</strong>${item.full_name || '(空)'}</div>
                            <div><strong>統一編號：</strong>${item.tax_id || '(空)'}</div>
                            <div><strong>聯絡人：</strong>${item.contact || '(空)'}</div>
                            <div><strong>電話：</strong>${item.phone || '(空)'}</div>
                            <div><strong>手機：</strong>${item.mobile || '(空)'}</div>
                            <div><strong>傳真：</strong>${item.fax || '(空)'}</div>
                            <div style="grid-column: span 3;"><strong>地址：</strong>${item.zip_code ? `[${item.zip_code}] ` : ''}${item.address || '(空)'}</div>
                            <div style="grid-column: span 3;"><strong>Email：</strong>${item.email || '(空)'}</div>
                            <div style="grid-column: span 3;"><strong>備註：</strong>${item.remark || '(空)'}</div>
                        </div>
                    </td>
                </tr>
            `).join('');
        };

        if (searchInput) {
            searchInput.oninput = renderFiltered;
        }
        renderFiltered();
    },

    async renderCustomers() {
        const data = await DB.getAll('customers');
        const tbody = document.getElementById('customers-tbody');
        const searchInput = document.getElementById('customer-search');
        if (!tbody) return;

        const renderFiltered = () => {
            const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
            const filtered = query ? data.filter(item => 
                (item.id || '').toLowerCase().includes(query) ||
                (item.name || '').toLowerCase().includes(query) ||
                (item.english_name || '').toLowerCase().includes(query) ||
                (item.phone || '').toLowerCase().includes(query) ||
                (item.address || '').toLowerCase().includes(query) ||
                (item.salesperson || '').toLowerCase().includes(query) ||
                (item.email || '').toLowerCase().includes(query)
            ) : data;

            if (!filtered.length) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 20px;">尚無符合篩選條件的客戶資料。</td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map(item => `
                <tr class="main-order-row" style="cursor: pointer;" onclick="app.toggleOrderDetail('${item.id}')">
                    <td id="arrow-${item.id}" style="text-align: center; font-size: 0.8rem; transition: transform 0.2s;"><i class="ph ph-caret-right"></i></td>
                    <td>${item.id || ''}</td>
                    <td>
                        <strong>${item.name || ''}</strong>
                        ${item.english_name ? `<span class="text-muted" style="font-size:0.82em;display:block">${item.english_name}</span>` : ''}
                    </td>
                    <td>${item.phone || ''}</td>
                    <td>${item.address || ''}</td>
                    <td>${item.salesperson || ''}</td>
                    <td>${item.email || ''}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" style="padding: 2px 6px; font-size: 0.8rem; margin-right: 4px;" onclick="event.stopPropagation(); app.showModal('customer-modal', '${item.id}')">修改</button>
                        <button class="btn btn-sm btn-outline" style="padding: 2px 6px; font-size: 0.8rem;" onclick="event.stopPropagation(); app.deleteRecord('customers', '${item.id}')">刪除</button>
                    </td>
                </tr>
                <tr id="detail-row-${item.id}" class="detail-row" style="display: none; background: rgba(0,0,0,0.01);">
                    <td colspan="8" style="padding: 12px 20px;">
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 0.88rem; text-align: left; color: var(--text-muted);">
                            <div><strong>英文名稱：</strong>${item.english_name || '(空)'}</div>
                            <div><strong>客戶類別：</strong>${item.customer_type || '(一般客戶)'}</div>
                            <div><strong>性別：</strong>${item.gender || '(空)'}</div>
                            <div><strong>生日：</strong>${item.birthday || '(空)'}</div>
                            <div><strong>統一編號：</strong>${item.tax_id || '(空)'}</div>
                            <div><strong>發票抬頭：</strong>${item.invoice_title || '(空)'}</div>
                            <div><strong>貴賓卡號：</strong>${item.vip_card || '(空)'}</div>
                            <div><strong>會員卡號：</strong>${item.member_card || '(空)'}</div>
                            <div><strong>儲值卡號：</strong>${item.store_value_id || '(空)'}</div>
                            <div><strong>傳真：</strong>${item.fax || '(空)'}</div>
                            <div style="grid-column: span 2;"><strong>郵遞區號 & 地址：</strong>${item.zip_code ? `[${item.zip_code}] ` : ''}${item.address || '(空)'}</div>
                            <div style="grid-column: span 3;"><strong>備註：</strong>${item.remarks || '(空)'}</div>
                        </div>
                    </td>
                </tr>
            `).join('');
        };

        if (searchInput) {
            searchInput.oninput = renderFiltered;
        }
        renderFiltered();
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
                // 1. 取得舊資料以進行比對
                const oldData = await DB.getAll(tableName);
                const oldMap = {};
                oldData.forEach(item => { oldMap[item.id] = item; });

                // Filter out empty rows (where ID is missing)
                const finalData = updatedData.filter(row => row.id && row.id.toString().trim() !== '');
                const newMap = {};
                finalData.forEach(item => { newMap[item.id] = item; });

                // 2. 執行 bulkInsert
                await DB.bulkInsert(tableName, finalData);

                // 3. 計算變更並記錄日誌
                const targetTypeMap = {
                    products: 'product',
                    suppliers: 'supplier',
                    customers: 'customer'
                };
                const targetType = targetTypeMap[tableName] || tableName;
                
                const tableNames = {
                    products: '商品',
                    suppliers: '廠商',
                    customers: '客戶'
                };
                const typeName = tableNames[tableName] || tableName;

                // A. 找出被刪除的
                for (const oldId in oldMap) {
                    if (!newMap[oldId]) {
                        const oldItem = oldMap[oldId];
                        const name = oldItem.name || oldId;
                        await this.addAuditLog('DELETE', targetType, oldId, `批次刪除${typeName}「${name}」 (編號: ${oldId})`, oldItem, null);
                    }
                }

                // B. 找出被新增的與被修改的
                for (const newId in newMap) {
                    const newItem = newMap[newId];
                    const name = newItem.name || newId;
                    const oldItem = oldMap[newId];

                    if (!oldItem) {
                        // 新增
                        await this.addAuditLog('CREATE', targetType, newId, `批次新增${typeName}「${name}」 (編號: ${newId})`, null, newItem);
                    } else {
                        // 比對是否有欄位變更
                        let changed = false;
                        const keys = new Set([...Object.keys(oldItem), ...Object.keys(newItem)]);
                        for (const key of keys) {
                            if (key === 'id') continue;
                            const oldStr = JSON.stringify(oldItem[key]);
                            const newStr = JSON.stringify(newItem[key]);
                            if (oldStr !== newStr) {
                                changed = true;
                                break;
                            }
                        }
                        if (changed) {
                            await this.addAuditLog('UPDATE', targetType, newId, `批次修改${typeName}「${name}」 (編號: ${newId})`, oldItem, newItem);
                        }
                    }
                }

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
                const row = Object.keys(mapping).map(k => {
                    if (item[k] === undefined) return '';
                    if (typeof item[k] === 'object' && item[k] !== null) {
                        return JSON.stringify(item[k]);
                    }
                    return item[k];
                });
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
        await mapToSheet('audit_logs', '系統日誌', {
            id: "日誌編號", timestamp: "時間戳記", action: "操作類型",
            target_type: "目標模組", target_id: "目標編號", description: "描述",
            details: "詳細資料(JSON)", operator: "操作人員"
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
                            let val = row[mapping[key]];
                            if (key === 'details' && typeof val === 'string' && val.trim() !== '') {
                                try {
                                    val = JSON.parse(val);
                                } catch (err) {
                                    // Keep as string if parsing fails
                                }
                            }
                            obj[key] = val !== undefined ? val : '';
                        }
                        return obj;
                    });
                    if (formatted.length > 0) {
                        await DB.bulkInsert(dbTable, formatted);
                    }
                };

                await db.transaction('rw', db.products, db.suppliers, db.customers, db.purchases, db.sales, db.audit_logs, async () => {
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
                    await processSheet('系統日誌', 'audit_logs', {
                        id: "日誌編號", timestamp: "時間戳記", action: "操作類型",
                        target_type: "目標模組", target_id: "目標編號", description: "描述",
                        details: "詳細資料(JSON)", operator: "操作人員"
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
            const oldVal = await db[table].get(id);
            await DB.delete(table, id);
            
            // 寫入變更日誌
            const name = oldVal ? (oldVal.name || id) : id;
            const tableNames = {
                products: '商品',
                suppliers: '廠商',
                customers: '客戶'
            };
            const typeName = tableNames[table] || table;
            const desc = `刪除${typeName}「${name}」 (編號: ${id})`;
            
            const targetTypeMap = {
                products: 'product',
                suppliers: 'supplier',
                customers: 'customer'
            };
            const targetType = targetTypeMap[table] || table;
            
            await this.addAuditLog('DELETE', targetType, id, desc, oldVal, null);
            
            this.showToast('刪除成功');
            this.navigate(this.currentView);
        }
    },

    async clearDatabase() {
        if (await this.confirm('警告：此操作將清除所有系統中的資料且不可還原。您確定嗎？', '危險操作')) {
            await DB.clearAll();
            await this.addAuditLog('DELETE', 'database', 'all', '清除所有系統資料庫資料', null, null);
            this.showToast('資料已全數清除');
            this.navigate('dashboard');
        }
    },

    // --- 系統變更日誌 (Audit Logs) 頁面渲染與交互 ---
    async renderLogs() {
        const searchInput = document.getElementById('log-search');
        const filterModule = document.getElementById('log-filter-module');
        const filterAction = document.getElementById('log-filter-action');
        const tbody = document.getElementById('logs-tbody');

        if (!tbody) return;

        const allLogs = await db.audit_logs.orderBy('id').reverse().toArray();

        const renderFiltered = () => {
            const query = (searchInput.value || '').toLowerCase().trim();
            const mod = filterModule.value;
            const act = filterAction.value;

            const filtered = allLogs.filter(log => {
                // 1. 動作篩選
                if (act && log.action !== act) return false;
                // 2. 模組篩選
                if (mod && log.target_type !== mod) return false;
                // 3. 關鍵字搜尋
                if (query) {
                    const matchDesc = (log.description || '').toLowerCase().includes(query);
                    const matchId = (log.target_id || '').toLowerCase().includes(query);
                    const matchOperator = (log.operator || '').toLowerCase().includes(query);
                    if (!matchDesc && !matchId && !matchOperator) return false;
                }
                return true;
            });

            if (!filtered.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 20px;">無符合篩選條件的日誌。</td></tr>';
                return;
            }

            const targetNames = {
                product: '商品庫存',
                purchase: '進貨管理',
                sale: '出貨管理',
                supplier: '進貨廠商',
                customer: '客戶資料',
                database: '系統資料庫'
            };

            tbody.innerHTML = filtered.map(log => {
                const dateStr = new Date(log.timestamp).toLocaleString('zh-TW');
                const actionBadgeColor = log.action === 'CREATE' ? 'var(--primary)' : (log.action === 'UPDATE' ? '#eab308' : 'var(--danger)');
                const hasDetails = log.details && (log.details.changed_fields || log.details.value);
                const detailBtn = hasDetails
                    ? `<button class="btn btn-sm btn-outline" style="padding: 2px 6px; font-size: 0.8rem; margin: 0 auto; display: block;" onclick="app.showLogDetail(${log.id})">檢視</button>`
                    : '<span style="color: var(--text-muted); font-size: 0.8rem; display: block; text-align: center;">無</span>';

                return `
                    <tr>
                        <td>${dateStr}</td>
                        <td>${log.operator || '系統管理員'}</td>
                        <td><span style="color: ${actionBadgeColor}; font-weight: bold;">${log.action}</span></td>
                        <td>${targetNames[log.target_type] || log.target_type}</td>
                        <td>${log.target_id || ''}</td>
                        <td>${log.description || ''}</td>
                        <td>${detailBtn}</td>
                    </tr>
                `;
            }).join('');
        };

        searchInput.oninput = renderFiltered;
        filterModule.onchange = renderFiltered;
        filterAction.onchange = renderFiltered;

        renderFiltered();
    },

    async showLogDetail(logId) {
        const log = await db.audit_logs.get(logId);
        if (!log || !log.details) {
            await this.alert('無此日誌的詳細資料');
            return;
        }

        let html = '';
        if (log.action === 'UPDATE' && log.details.changed_fields) {
            const diff = log.details.changed_fields;
            let rowsHtml = '';
            
            // 欄位名稱翻譯對照
            const fieldNames = {
                name: '名稱', category: '類別', cost: '進貨成本/單位成本',
                price: '售價/預計售價', stock: '庫存量', unit: '單位',
                supplier_id: '供應商/廠商ID', customer_id: '客戶ID',
                date: '日期', qty: '數量', total: '總金額',
                full_name: '廠商全名', contact: '聯絡人', tax_id: '統一編號',
                phone: '電話', mobile: '手機', fax: '傳真',
                zip_code: '郵遞區號', address: '地址', remark: '備註',
                remarks: '備註', email: 'Email', salesperson: '服務員',
                birthday: '生日', gender: '性別', vip_card: '貴賓卡號',
                member_card: '會員卡號', items: '明細品項',
                supplier_name: '廠商名稱', customer_name: '客戶名稱'
            };

            const formatValue = (field, val) => {
                if (val === undefined || val === null) return '(空)';
                if (field === 'items' && Array.isArray(val)) {
                    if (val.length === 0) return '(無品項)';
                    return val.map(item => {
                        const name = item.product_name || item.pid || '未知商品';
                        const qty = item.qty || 0;
                        const price = item.cost !== undefined ? item.cost : (item.price !== undefined ? item.price : 0);
                        const priceLabel = item.cost !== undefined ? '進價' : '售價';
                        return `• ${name} (${qty} 個, ${priceLabel}: ${price})`;
                    }).join('<br>');
                }
                if (typeof val === 'object') {
                    return `<pre style="margin:0; font-family:monospace; font-size:0.8rem; white-space:pre-wrap; word-break:break-all; background:none; padding:0; border:none; max-width:100%;">${JSON.stringify(val, null, 2)}</pre>`;
                }
                return val;
            };

            for (const field in diff) {
                const oldText = formatValue(field, diff[field].old);
                const newText = formatValue(field, diff[field].new);
                
                rowsHtml += `
                    <tr>
                        <td style="padding: 8px 6px; font-weight: bold; vertical-align: top; word-break: break-word;">${fieldNames[field] || field}</td>
                        <td style="padding: 8px 6px; color: var(--danger); text-decoration: line-through; vertical-align: top; word-break: break-all; white-space: pre-wrap;">${oldText}</td>
                        <td style="padding: 8px 6px; color: var(--primary); font-weight: bold; vertical-align: top; word-break: break-all; white-space: pre-wrap;">➔ ${newText}</td>
                    </tr>
                `;
            }

            html = `
                <div style="text-align: left; max-width: 100%; overflow-x: hidden;">
                    <p style="margin-bottom: 8px; font-size: 0.9rem;"><strong>日誌說明：</strong>${log.description}</p>
                    <table class="data-table" style="width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 0.85rem; margin-top: 8px;">
                        <thead>
                            <tr>
                                <th style="padding: 6px; text-align: left; width: 25%;">變更欄位</th>
                                <th style="padding: 6px; text-align: left; width: 37.5%;">修改前</th>
                                <th style="padding: 6px; text-align: left; width: 37.5%;">修改後</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            // 新增 (CREATE) 或 刪除 (DELETE) 的快照物件呈現
            const val = log.details.value || log.details;
            const prettyJson = JSON.stringify(val, null, 2);
            html = `
                <div style="text-align: left;">
                    <p style="margin-bottom: 8px;"><strong>日誌說明：</strong>${log.description}</p>
                    <p style="margin-bottom: 4px;"><strong>資料快照 (Snapshot)：</strong></p>
                    <pre style="background: rgba(0,0,0,0.03); padding: 12px; border-radius: 6px; max-height: 250px; overflow-y: auto; font-family: monospace; font-size: 0.8rem; margin: 0; white-space: pre-wrap; word-break: break-all;">${prettyJson}</pre>
                </div>
            `;
        }

        await this.alert(html, `${log.action} 詳細資料`);
    },

    // --- Settings 頁面渲染（含一鍵匯入舊資料） ---
    async renderSettings() {
        // 設定頁面由 index.html 的 tpl-settings 範本直接靜態渲染，此處無須額外動態邏輯
    },

    // --- Modal Logic (Basic support for adding Product/Purchase/Sale) ---
    async showModal(type, extraData) {
        const overlay = document.getElementById('modal-container');
        const mTitle = document.getElementById('modal-title');
        const mBody = document.getElementById('modal-body');
        const mSave = document.getElementById('modal-save-btn');

        const modalEl = overlay.querySelector('.modal');
        if (modalEl) {
            if (type === 'purchase-modal' || type === 'sale-modal' || type === 'supplier-modal' || type === 'customer-modal') {
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
            const isEdit = !!extraData;
            mTitle.innerText = isEdit ? '編輯商品' : '新增商品';
            
            const oldVal = isEdit ? await db.products.get(extraData) : null;
            const defaultId = isEdit ? extraData : await this.generateProductSequenceID();
            
            const allProducts = await db.products.toArray();
            const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
            
            html = `
                <div class="form-group"><label>產品代碼</label><input type="text" id="m-id" class="form-control" value="${defaultId}" ${isEdit ? 'readonly' : ''}></div>
                <div class="form-group"><label>產品名稱</label><input type="text" id="m-name" class="form-control" value="${oldVal ? (oldVal.name || '') : ''}"></div>
                <div class="form-group">
                    <label>產品類別</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select id="m-category-select" class="form-control" style="flex: 1;">
                            <option value="">請選擇類別...</option>
                            ${categories.map(cat => `<option value="${cat}" ${oldVal && oldVal.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                        </select>
                        <input type="text" id="m-category-input" class="form-control" style="flex: 1; display: none;" placeholder="請輸入新類別" value="${oldVal ? (oldVal.category || '') : ''}">
                        <button type="button" id="btn-toggle-category" class="btn btn-sm btn-outline" style="white-space: nowrap; padding: 4px 8px; font-size: 0.8rem; height: 36px;">+ 新增</button>
                    </div>
                </div>
                <div class="form-group"><label>預計售價</label><input type="number" id="m-price" class="form-control" value="${oldVal ? (oldVal.price || 0) : ''}"></div>
                <div class="form-group"><label>庫存量</label><input type="number" id="m-stock" class="form-control" value="${oldVal ? (oldVal.stock || 0) : '0'}"></div>
            `;
            
            postRender = () => {
                const sel = document.getElementById('m-category-select');
                const inp = document.getElementById('m-category-input');
                const btn = document.getElementById('btn-toggle-category');
                
                let customMode = false;
                
                if (categories.length === 0) {
                    sel.style.display = 'none';
                    inp.style.display = 'block';
                    btn.style.display = 'none';
                } else {
                    btn.onclick = () => {
                        customMode = !customMode;
                        if (customMode) {
                            sel.style.display = 'none';
                            inp.style.display = 'block';
                            btn.innerText = '選擇已有';
                            inp.focus();
                        } else {
                            sel.style.display = 'block';
                            inp.style.display = 'none';
                            btn.innerText = '+ 新增';
                        }
                    };
                }
            };
            
            saveHandler = async () => {
                const id = document.getElementById('m-id').value;
                const name = document.getElementById('m-name').value;
                
                const inp = document.getElementById('m-category-input');
                const sel = document.getElementById('m-category-select');
                const isCustom = inp.style.display !== 'none';
                const category = isCustom ? inp.value.trim() : sel.value;
                
                const price = Number(document.getElementById('m-price').value || 0);
                const stock = Number(document.getElementById('m-stock').value || 0);

                if (!id) { await this.alert('請輸入產品代碼'); return false; }

                const currentOldVal = await db.products.get(id);
                const currentIsEdit = !!currentOldVal;

                const cost = currentOldVal ? (currentOldVal.cost || 0) : 0;
                const unit = currentOldVal ? (currentOldVal.unit || '') : '';
                const supplier_id = currentOldVal ? (currentOldVal.supplier_id || '') : '';

                const productData = { id, name, category, cost, price, stock, unit, supplier_id };
                await DB.save('products', productData);

                const action = currentIsEdit ? 'UPDATE' : 'CREATE';
                const desc = currentIsEdit ? `編輯商品「${name}」 (代碼: ${id})` : `新增商品「${name}」 (代碼: ${id})`;
                await this.addAuditLog(action, 'product', id, desc, currentOldVal, productData);

                return true;
            };
        } else if (type === 'supplier-modal') {
            const isEdit = !!extraData;
            mTitle.innerText = isEdit ? '編輯廠商' : '新增廠商';
            
            const oldVal = isEdit ? await db.suppliers.get(extraData) : null;
            const defaultId = isEdit ? extraData : this.generateID('S');
            
            html = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-height: 400px; overflow-y: auto; padding-right: 6px;">
                    <div class="form-group"><label>廠商編號</label><input type="text" id="m-id" class="form-control" value="${defaultId}" ${isEdit ? 'readonly' : ''}></div>
                    <div class="form-group"><label>廠商名稱（簡稱）</label><input type="text" id="m-name" class="form-control" value="${isEdit ? (oldVal.name || '') : ''}"></div>
                    <div class="form-group"><label>廠商全名</label><input type="text" id="m-full-name" class="form-control" value="${isEdit ? (oldVal.full_name || '') : ''}"></div>
                    <div class="form-group"><label>聯絡人</label><input type="text" id="m-contact" class="form-control" value="${isEdit ? (oldVal.contact || '') : ''}"></div>
                    <div class="form-group"><label>電話</label><input type="text" id="m-phone" class="form-control" value="${isEdit ? (oldVal.phone || '') : ''}"></div>
                    <div class="form-group"><label>手機</label><input type="text" id="m-mobile" class="form-control" value="${isEdit ? (oldVal.mobile || '') : ''}"></div>
                    <div class="form-group"><label>傳真</label><input type="text" id="m-fax" class="form-control" value="${isEdit ? (oldVal.fax || '') : ''}"></div>
                    <div class="form-group"><label>統一編號</label><input type="text" id="m-tax-id" class="form-control" value="${isEdit ? (oldVal.tax_id || '') : ''}"></div>
                    <div class="form-group"><label>郵遞區號</label><input type="text" id="m-zip-code" class="form-control" value="${isEdit ? (oldVal.zip_code || '') : ''}"></div>
                    <div class="form-group"><label>地址</label><input type="text" id="m-address" class="form-control" value="${isEdit ? (oldVal.address || '') : ''}"></div>
                    <div class="form-group" style="grid-column: span 2;"><label>Email</label><input type="text" id="m-email" class="form-control" value="${isEdit ? (oldVal.email || '') : ''}"></div>
                    <div class="form-group" style="grid-column: span 2;"><label>備註</label><textarea id="m-remark" class="form-control" rows="2">${isEdit ? (oldVal.remark || '') : ''}</textarea></div>
                </div>
            `;
            
            saveHandler = async () => {
                const id = document.getElementById('m-id').value.trim();
                const name = document.getElementById('m-name').value.trim();
                const full_name = document.getElementById('m-full-name').value.trim();
                const contact = document.getElementById('m-contact').value.trim();
                const phone = document.getElementById('m-phone').value.trim();
                const mobile = document.getElementById('m-mobile').value.trim();
                const fax = document.getElementById('m-fax').value.trim();
                const tax_id = document.getElementById('m-tax-id').value.trim();
                const zip_code = document.getElementById('m-zip-code').value.trim();
                const address = document.getElementById('m-address').value.trim();
                const email = document.getElementById('m-email').value.trim();
                const remark = document.getElementById('m-remark').value.trim();

                if (!id) { await this.alert('請輸入廠商編號'); return false; }
                if (!name) { await this.alert('請輸入廠商名稱'); return false; }

                const supplierData = { id, name, full_name, contact, phone, mobile, fax, tax_id, zip_code, address, email, remark };
                await DB.save('suppliers', supplierData);

                const action = isEdit ? 'UPDATE' : 'CREATE';
                const desc = isEdit ? `編輯廠商「${name}」 (編號: ${id})` : `新增廠商「${name}」 (編號: ${id})`;
                await this.addAuditLog(action, 'supplier', id, desc, oldVal, supplierData);

                this.showToast(isEdit ? '廠商更新成功' : '廠商新增成功');
                return true;
            };
        } else if (type === 'customer-modal') {
            const isEdit = !!extraData;
            mTitle.innerText = isEdit ? '編輯客戶' : '新增客戶';
            
            const oldVal = isEdit ? await db.customers.get(extraData) : null;
            const defaultId = isEdit ? extraData : this.generateID('C');
            
            html = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-height: 400px; overflow-y: auto; padding-right: 6px;">
                    <div class="form-group"><label>客戶編號</label><input type="text" id="m-id" class="form-control" value="${defaultId}" ${isEdit ? 'readonly' : ''}></div>
                    <div class="form-group"><label>客戶名稱</label><input type="text" id="m-name" class="form-control" value="${isEdit ? (oldVal.name || '') : ''}"></div>
                    <div class="form-group"><label>英文名稱</label><input type="text" id="m-english-name" class="form-control" value="${isEdit ? (oldVal.english_name || '') : ''}"></div>
                    <div class="form-group"><label>電話</label><input type="text" id="m-phone" class="form-control" value="${isEdit ? (oldVal.phone || '') : ''}"></div>
                    <div class="form-group"><label>服務員</label><input type="text" id="m-salesperson" class="form-control" value="${isEdit ? (oldVal.salesperson || '') : ''}"></div>
                    <div class="form-group"><label>統一編號</label><input type="text" id="m-tax-id" class="form-control" value="${isEdit ? (oldVal.tax_id || '') : ''}"></div>
                    <div class="form-group"><label>發票抬頭</label><input type="text" id="m-invoice-title" class="form-control" value="${isEdit ? (oldVal.invoice_title || '') : ''}"></div>
                    <div class="form-group"><label>郵遞區號</label><input type="text" id="m-zip-code" class="form-control" value="${isEdit ? (oldVal.zip_code || '') : ''}"></div>
                    <div class="form-group"><label>客戶類別</label><input type="text" id="m-customer-type" class="form-control" value="${isEdit ? (oldVal.customer_type || '') : ''}" placeholder="例：VIP、一般客戶"></div>
                    <div class="form-group"><label>性別</label><input type="text" id="m-gender" class="form-control" value="${isEdit ? (oldVal.gender || '') : ''}" placeholder="例：男、女"></div>
                    <div class="form-group"><label>生日</label><input type="date" id="m-birthday" class="form-control" value="${isEdit ? (oldVal.birthday || '') : ''}"></div>
                    <div class="form-group"><label>傳真</label><input type="text" id="m-fax" class="form-control" value="${isEdit ? (oldVal.fax || '') : ''}"></div>
                    <div class="form-group"><label>貴賓卡號</label><input type="text" id="m-vip-card" class="form-control" value="${isEdit ? (oldVal.vip_card || '') : ''}"></div>
                    <div class="form-group"><label>會員卡號</label><input type="text" id="m-member-card" class="form-control" value="${isEdit ? (oldVal.member_card || '') : ''}"></div>
                    <div class="form-group"><label>儲值卡號</label><input type="text" id="m-store-value-id" class="form-control" value="${isEdit ? (oldVal.store_value_id || '') : ''}"></div>
                    <div class="form-group"><label>Email</label><input type="text" id="m-email" class="form-control" value="${isEdit ? (oldVal.email || '') : ''}"></div>
                    <div class="form-group" style="grid-column: span 2;"><label>地址</label><input type="text" id="m-address" class="form-control" value="${isEdit ? (oldVal.address || '') : ''}"></div>
                    <div class="form-group" style="grid-column: span 2;"><label>備註</label><textarea id="m-remarks" class="form-control" rows="2">${isEdit ? (oldVal.remarks || '') : ''}</textarea></div>
                </div>
            `;
            
            saveHandler = async () => {
                const id = document.getElementById('m-id').value.trim();
                const name = document.getElementById('m-name').value.trim();
                const english_name = document.getElementById('m-english-name').value.trim();
                const phone = document.getElementById('m-phone').value.trim();
                const address = document.getElementById('m-address').value.trim();
                const salesperson = document.getElementById('m-salesperson').value.trim();
                const email = document.getElementById('m-email').value.trim();
                const tax_id = document.getElementById('m-tax-id').value.trim();
                const invoice_title = document.getElementById('m-invoice-title').value.trim();
                const vip_card = document.getElementById('m-vip-card').value.trim();
                const member_card = document.getElementById('m-member-card').value.trim();
                const store_value_id = document.getElementById('m-store-value-id').value.trim();
                const customer_type = document.getElementById('m-customer-type').value.trim();
                const gender = document.getElementById('m-gender').value.trim();
                const birthday = document.getElementById('m-birthday').value;
                const fax = document.getElementById('m-fax').value.trim();
                const zip_code = document.getElementById('m-zip-code').value.trim();
                const remarks = document.getElementById('m-remarks').value.trim();

                if (!id) { await this.alert('請輸入客戶編號'); return false; }
                if (!name) { await this.alert('請輸入客戶名稱'); return false; }

                const customerData = { id, name, english_name, phone, address, salesperson, email, tax_id, invoice_title, vip_card, member_card, store_value_id, customer_type, gender, birthday, fax, zip_code, remarks };
                await DB.save('customers', customerData);

                const action = isEdit ? 'UPDATE' : 'CREATE';
                const desc = isEdit ? `編輯客戶「${name}」 (編號: ${id})` : `新增客戶「${name}」 (編號: ${id})`;
                await this.addAuditLog(action, 'customer', id, desc, oldVal, customerData);

                this.showToast(isEdit ? '客戶更新成功' : '客戶新增成功');
                return true;
            };
        } else if (type === 'purchase-modal') {
            const isEdit = !!extraData;
            mTitle.innerText = isEdit ? '編輯進貨紀錄' : '新增進貨紀錄';
            
            // 如果是編輯模式，讀取該 orderId 的所有舊項目
            let existingItems = [];
            if (isEdit) {
                const rawItems = await db.purchases.where('id').startsWith(extraData).toArray();
                existingItems = await Promise.all(rawItems.map(async item => {
                    const prod = await db.products.get(item.product_id);
                    return {
                        ...item,
                        product_name: prod ? prod.name : '未知產品'
                    };
                }));
            }

            const tid = isEdit ? extraData : this.generateID('P');
            const defaultDate = (isEdit && existingItems.length > 0)
                ? existingItems[0].date
                : new Date().toISOString().slice(0, 10);
            const defaultSid = (isEdit && existingItems.length > 0)
                ? existingItems[0].supplier_id
                : '';

            const suppliers = await DB.getAll('suppliers');
            const products = await DB.getAll('products');

            const sOptions = suppliers.map(s => `<option value="${s.id}" ${s.id === defaultSid ? 'selected' : ''}>${s.name} (${s.id})</option>`).join('');

            // 建立原本該單的採購數量 map，便於計算編輯時的可用庫存或最小數量
            const originalItemMap = {};
            if (isEdit && existingItems.length > 0) {
                existingItems.forEach(item => {
                    originalItemMap[item.product_id] = (originalItemMap[item.product_id] || 0) + item.qty;
                });
            }

            html = `
                <div class="form-group"><label>進貨單號</label><input type="text" id="m-id" class="form-control" value="${tid}" readonly></div>
                <div class="form-group"><label>日期</label><input type="date" id="m-date" class="form-control" value="${defaultDate}"></div>
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

                const addItemRow = (prefillData = null) => {
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
                    const qtyInp = newRow.querySelector('.item-qty');
                    const costInp = newRow.querySelector('.item-cost');
                    const stockInfo = newRow.querySelector('.item-stock-info');

                    catSel.onchange = () => {
                        const selectedCat = catSel.value;
                        const filtered = products.filter(p => p.category === selectedCat);
                        pidSel.innerHTML = '<option value="">請選擇產品...</option>' + 
                            filtered.map(p => `<option value="${p.id}" data-cost="${p.cost}" data-stock="${p.stock}">${p.name} (${p.id})</option>`).join('');
                        stockInfo.innerText = '';
                    };

                    pidSel.onchange = () => {
                        const opt = pidSel.options[pidSel.selectedIndex];
                        if (opt && opt.value) {
                            const pid = opt.value;
                            costInp.value = opt.getAttribute('data-cost') || 0;
                            
                            const currentStock = Number(opt.getAttribute('data-stock') || 0);
                            stockInfo.innerText = `(庫存: ${currentStock})`;
                            
                            // 進貨數量最小限制：若改小數量，扣除庫存後不能小於 0
                            // 預期庫存 = 目前庫存 + (newQty - oldQty) >= 0 => newQty >= oldQty - 目前庫存
                            const oldQty = originalItemMap[pid] || 0;
                            const minVal = Math.max(1, oldQty - currentStock);
                            qtyInp.min = minVal;
                            if (Number(qtyInp.value) < minVal) {
                                qtyInp.value = minVal;
                            }
                        } else {
                            stockInfo.innerText = '';
                        }
                    };

                    // 若有預載資料，載入預填
                    if (prefillData) {
                        const prod = products.find(p => p.id === prefillData.product_id);
                        if (prod) {
                            catSel.value = prod.category || '';
                            const filtered = products.filter(p => p.category === prod.category);
                            pidSel.innerHTML = '<option value="">請選擇產品...</option>' + 
                                filtered.map(p => `<option value="${p.id}" data-cost="${p.cost}" data-stock="${p.stock}">${p.name} (${p.id})</option>`).join('');
                            pidSel.value = prefillData.product_id;
                            
                            const currentStock = Number(prod.stock || 0);
                            stockInfo.innerText = `(庫存: ${currentStock})`;
                            
                            const oldQty = originalItemMap[prefillData.product_id] || 0;
                            const minVal = Math.max(1, oldQty - currentStock);
                            qtyInp.min = minVal;
                            qtyInp.value = prefillData.qty;
                            costInp.value = prefillData.cost;
                        }
                    }
                };

                addBtn.onclick = () => addItemRow();

                if (isEdit && existingItems.length > 0) {
                    existingItems.forEach(item => addItemRow(item));
                } else {
                    addItemRow(); // 預設加一筆
                }
            };

            saveHandler = async () => {
                const sid = document.getElementById('m-sid').value;
                const date = document.getElementById('m-date').value;
                const id = document.getElementById('m-id').value;
                
                if (!sid) { await this.alert('請選擇廠商'); return false; }
                
                const rows = document.querySelectorAll('.purchase-item-row');
                if (!rows.length) { await this.alert('請至少新增一個品項'); return false; }
                
                const newItems = [];
                const newProductQtySummary = {};
                
                for (const row of rows) {
                    const pid = row.querySelector('.item-pid').value;
                    const qty = Number(row.querySelector('.item-qty').value);
                    const cost = Number(row.querySelector('.item-cost').value);
                    
                    if (!pid) { await this.alert('請選擇所有品項的產品'); return false; }
                    if (qty <= 0) { await this.alert('數量必須大於 0'); return false; }
                    if (cost < 0) { await this.alert('單位成本不能小於 0'); return false; }
                    
                    const prod = products.find(p => p.id === pid);
                    const prodName = prod ? prod.name : '';
                    newItems.push({ pid, product_name: prodName, qty, cost });
                    newProductQtySummary[pid] = (newProductQtySummary[pid] || 0) + qty;
                }
                
                // 檢查庫存量，並建立變動列表
                const affectedProductIds = new Set([
                    ...Object.keys(originalItemMap),
                    ...Object.keys(newProductQtySummary)
                ]);
                
                const changeDetails = [];
                const productsToUpdate = {}; // pid -> { change }
                
                for (const pid of affectedProductIds) {
                    const oldQty = originalItemMap[pid] || 0;
                    const newQty = newProductQtySummary[pid] || 0;
                    const change = newQty - oldQty; // 對庫存的影響量：庫存_新 = 庫存_舊 + (newQty - oldQty)
                    
                    if (change === 0) continue;
                    
                    const prod = products.find(p => p.id === pid) || await db.products.get(pid);
                    if (!prod) {
                        await this.alert(`找不到產品代碼：${pid}`);
                        return false;
                    }
                    
                    const currentStock = Number(prod.stock || 0);
                    const estStock = currentStock + change;
                    
                    if (estStock < 0) {
                        await this.alert(`庫存不足！商品「${prod.name}」目前庫存為 ${currentStock}，若在此單進貨變動（扣除）${Math.abs(change)}，將導致預計庫存不足（預計為 ${estStock}）`);
                        return false;
                    }
                    
                    changeDetails.push({
                        name: prod.name,
                        id: prod.id,
                        currentStock: currentStock,
                        change: change,
                        estStock: estStock
                    });
                    
                    productsToUpdate[pid] = {
                        change: change
                    };
                }
                
                // 如果有任何變動，顯示本次改動總結的畫面
                if (changeDetails.length > 0) {
                    let summaryRowsHtml = '';
                    changeDetails.forEach(item => {
                        const changeStr = item.change > 0 ? `+${item.change}` : `${item.change}`;
                        const changeColor = item.change > 0 ? 'var(--primary)' : 'var(--danger)';
                        summaryRowsHtml += `
                            <tr>
                                <td>${item.name} (${item.id})</td>
                                <td>${item.currentStock}</td>
                                <td style="color: ${changeColor}; font-weight: bold;">${changeStr}</td>
                                <td>${item.estStock}</td>
                            </tr>
                        `;
                    });
                    
                    const summaryHtml = `
                        <div style="text-align: left;">
                            <p>請確認以下商品的庫存變動：</p>
                            <table class="data-table" style="width: 100%; margin-top: 12px; font-size: 0.85rem; border-collapse: collapse;">
                                <thead>
                                    <tr>
                                        <th style="text-align: left; padding: 6px;">產品名稱</th>
                                        <th style="text-align: left; padding: 6px;">目前庫存</th>
                                        <th style="text-align: left; padding: 6px;">本次變動</th>
                                        <th style="text-align: left; padding: 6px;">預計新庫存</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${summaryRowsHtml}
                                </tbody>
                            </table>
                            <p style="margin-top: 12px; color: var(--text-muted); font-size: 0.85rem;">按下「確認」將儲存此進貨單並更新庫存。</p>
                        </div>
                    `;
                    
                    const confirmed = await this.confirm(summaryHtml, isEdit ? '編輯進貨庫存變動確認' : '新增進貨庫存變動確認');
                    if (!confirmed) return false; // 使用者按取消，不關閉 Modal
                }
                
                // 執行正式儲存與更新庫存
                try {
                    await db.transaction('rw', db.products, db.purchases, db.audit_logs, async () => {
                        // 1. 如果是編輯模式，先刪除該 orderId 對應的所有舊進貨明細
                        if (isEdit) {
                            await db.purchases.where('id').startsWith(tid).delete();
                        }
                        
                        // 2. 寫入新進貨明細
                        for (let i = 0; i < newItems.length; i++) {
                            const item = newItems[i];
                            const subId = `${tid}-${i+1}`;
                            await db.purchases.put({
                                id: subId,
                                date: date,
                                supplier_id: sid,
                                product_id: item.pid,
                                qty: item.qty,
                                cost: item.cost,
                                total: item.qty * item.cost
                            });
                        }
                        
                        // 3. 更新所有庫存變動
                        for (const pid in productsToUpdate) {
                            const updateInfo = productsToUpdate[pid];
                            const prod = await db.products.get(pid);
                            if (prod) {
                                prod.stock = Number(prod.stock || 0) + updateInfo.change;
                                await db.products.put(prod);
                            }
                        }

                        // 4. 記錄變更歷程
                        const supplier = suppliers.find(s => s.id === sid);
                        const supplierName = supplier ? supplier.name : sid;
                        const action = isEdit ? 'UPDATE' : 'CREATE';
                        const desc = isEdit ? `編輯進貨單 ${tid} (廠商: ${supplierName})` : `新增進貨單 ${tid} (廠商: ${supplierName})`;
                        
                        const logOld = isEdit ? { supplier_id: defaultSid, supplier_name: suppliers.find(s => s.id === defaultSid)?.name || defaultSid, items: existingItems } : null;
                        const logNew = { supplier_id: sid, supplier_name: supplierName, items: newItems };
                        
                        await this.addAuditLog(action, 'purchase', tid, desc, logOld, logNew);
                    });
                    
                    this._modalSuccessMsg = isEdit ? '編輯成功' : '新增成功';
                    return true;
                } catch (err) {
                    console.error(err);
                    await this.alert('儲存失敗：' + err.message);
                    return false;
                }
            };
        } else if (type === 'sale-modal') {
            const isEdit = !!extraData;
            mTitle.innerText = isEdit ? '編輯出貨紀錄' : '新增出貨紀錄';
            
            // 如果是編輯模式，讀取該 orderId 的所有舊項目
            let existingItems = [];
            if (isEdit) {
                const rawItems = await db.sales.where('id').startsWith(extraData).toArray();
                existingItems = await Promise.all(rawItems.map(async item => {
                    const prod = await db.products.get(item.product_id);
                    return {
                        ...item,
                        product_name: prod ? prod.name : '未知產品'
                    };
                }));
            }
            
            const tid = isEdit ? extraData : this.generateID('S');
            const defaultDate = (isEdit && existingItems.length > 0) 
                ? existingItems[0].date 
                : new Date().toISOString().slice(0, 10);
            const defaultCid = (isEdit && existingItems.length > 0)
                ? existingItems[0].customer_id
                : '';

            const customers = await DB.getAll('customers');
            const products = await DB.getAll('products');

            // 建立原本該單的產品數量 map，便於編輯模式下算可用庫存
            const originalItemMap = {};
            if (isEdit && existingItems.length > 0) {
                existingItems.forEach(item => {
                    originalItemMap[item.product_id] = (originalItemMap[item.product_id] || 0) + item.qty;
                });
            }

            html = `
                <div class="form-group"><label>出貨單號</label><input type="text" id="m-id" class="form-control" value="${tid}" readonly></div>
                <div class="form-group"><label>日期</label><input type="date" id="m-date" class="form-control" value="${defaultDate}"></div>
                <div class="form-group" style="position: relative;">
                    <label>客戶</label>
                    <input type="text" id="m-cid-search" class="form-control" placeholder="輸入客戶姓名或編號搜尋..." autocomplete="off">
                    <input type="hidden" id="m-cid" value="${defaultCid}">
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

                const addItemRow = (prefillData = null) => {
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
                            filtered.map(p => {
                                const availableStock = Number(p.stock || 0) + (originalItemMap[p.id] || 0);
                                return `<option value="${p.id}" data-price="${p.price}" data-stock="${availableStock}">${p.name} (${p.id})</option>`;
                            }).join('');
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

                    // 若有預填資料，載入預填
                    if (prefillData) {
                        const prod = products.find(p => p.id === prefillData.product_id);
                        if (prod) {
                            catSel.value = prod.category || '';
                            const filtered = products.filter(p => p.category === prod.category);
                            pidSel.innerHTML = '<option value="">請選擇產品...</option>' + 
                                filtered.map(p => {
                                    const availableStock = Number(p.stock || 0) + (originalItemMap[p.id] || 0);
                                    return `<option value="${p.id}" data-price="${p.price}" data-stock="${availableStock}">${p.name} (${p.id})</option>`;
                                }).join('');
                            pidSel.value = prefillData.product_id;
                            
                            const availableStock = Number(prod.stock || 0) + (originalItemMap[prefillData.product_id] || 0);
                            stockInfo.innerText = `(庫存: ${availableStock})`;
                            qtyInp.max = availableStock;
                            qtyInp.value = prefillData.qty;
                            priceInp.value = prefillData.price;
                        }
                    }
                };

                addBtn.onclick = () => addItemRow();

                if (isEdit && existingItems.length > 0) {
                    existingItems.forEach(item => addItemRow(item));
                } else {
                    addItemRow(); // 預設加一筆
                }

                // Autocomplete for Customer search
                const cidSearch = document.getElementById('m-cid-search');
                const cidHidden = document.getElementById('m-cid');
                const cidDropdown = document.getElementById('m-cid-dropdown');

                // 預填客戶資訊 (編輯模式下)
                if (isEdit && existingItems.length > 0) {
                    const cust = customers.find(c => c.id === defaultCid);
                    if (cust) {
                        cidSearch.value = `${cust.name} (${cust.id})`;
                    }
                }

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
                
                const newItems = [];
                const newProductQtySummary = {};
                
                for (const row of rows) {
                    const pid = row.querySelector('.item-pid').value;
                    const qty = Number(row.querySelector('.item-qty').value);
                    const price = Number(row.querySelector('.item-price').value);
                    
                    if (!pid) { await this.alert('請選擇所有品項的產品'); return false; }
                    if (qty <= 0) { await this.alert('數量必須大於 0'); return false; }
                    if (price < 0) { await this.alert('售價單價不能小於 0'); return false; }
                    
                    const prod = products.find(p => p.id === pid);
                    const prodName = prod ? prod.name : '';
                    newItems.push({ pid, product_name: prodName, qty, price });
                    newProductQtySummary[pid] = (newProductQtySummary[pid] || 0) + qty;
                }
                
                // 檢查庫存量，並建立變動列表
                const affectedProductIds = new Set([
                    ...Object.keys(originalItemMap),
                    ...Object.keys(newProductQtySummary)
                ]);
                
                const changeDetails = [];
                const productsToUpdate = {}; // pid -> { change }
                
                for (const pid of affectedProductIds) {
                    const oldQty = originalItemMap[pid] || 0;
                    const newQty = newProductQtySummary[pid] || 0;
                    const change = oldQty - newQty; // 對庫存的影響：庫存_新 = 庫存_舊 + oldQty - newQty
                    
                    if (change === 0) continue;
                    
                    const prod = products.find(p => p.id === pid) || await db.products.get(pid);
                    if (!prod) {
                        await this.alert(`找不到產品代碼：${pid}`);
                        return false;
                    }
                    
                    const currentStock = Number(prod.stock || 0);
                    const estStock = currentStock + change;
                    
                    if (estStock < 0) {
                        await this.alert(`庫存不足！商品「${prod.name}」目前庫存為 ${currentStock}，若在此單出貨 ${newQty}（原本出貨 ${oldQty}），將導致預計庫存不足（預計為 ${estStock}）`);
                        return false;
                    }
                    
                    changeDetails.push({
                        name: prod.name,
                        id: prod.id,
                        currentStock: currentStock,
                        change: change,
                        estStock: estStock
                    });
                    
                    productsToUpdate[pid] = {
                        change: change
                    };
                }
                
                // 如果有變動，顯示本次改動總結的畫面
                if (changeDetails.length > 0) {
                    let summaryRowsHtml = '';
                    changeDetails.forEach(item => {
                        const changeStr = item.change > 0 ? `+${item.change}` : `${item.change}`;
                        const changeColor = item.change > 0 ? 'var(--primary)' : 'var(--danger)';
                        summaryRowsHtml += `
                            <tr>
                                <td>${item.name} (${item.id})</td>
                                <td>${item.currentStock}</td>
                                <td style="color: ${changeColor}; font-weight: bold;">${changeStr}</td>
                                <td>${item.estStock}</td>
                            </tr>
                        `;
                    });
                    
                    const summaryHtml = `
                        <div style="text-align: left;">
                            <p>請確認以下商品的庫存變動：</p>
                            <table class="data-table" style="width: 100%; margin-top: 12px; font-size: 0.85rem; border-collapse: collapse;">
                                <thead>
                                    <tr>
                                        <th style="text-align: left; padding: 6px;">產品名稱</th>
                                        <th style="text-align: left; padding: 6px;">目前庫存</th>
                                        <th style="text-align: left; padding: 6px;">本次變動</th>
                                        <th style="text-align: left; padding: 6px;">預計新庫存</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${summaryRowsHtml}
                                </tbody>
                            </table>
                            <p style="margin-top: 12px; color: var(--text-muted); font-size: 0.85rem;">按下「確認」將儲存此出貨單並更新庫存。</p>
                        </div>
                    `;
                    
                    const confirmed = await this.confirm(summaryHtml, isEdit ? '編輯出貨庫存變動確認' : '新增出貨庫存變動確認');
                    if (!confirmed) return false; // 使用者按取消，不關閉 Modal
                }
                
                // 執行正式儲存與更新庫存
                try {
                    await db.transaction('rw', db.products, db.sales, db.audit_logs, async () => {
                        // 1. 如果是編輯模式，先刪除該 orderId 對應的所有舊銷售明細
                        if (isEdit) {
                            await db.sales.where('id').startsWith(tid).delete();
                        }
                        
                        // 2. 寫入新銷售明細
                        for (let i = 0; i < newItems.length; i++) {
                            const item = newItems[i];
                            const subId = `${tid}-${i+1}`;
                            await db.sales.put({
                                id: subId,
                                date: date,
                                customer_id: cid,
                                product_id: item.pid,
                                qty: item.qty,
                                price: item.price,
                                total: item.qty * item.price
                            });
                        }
                        
                        // 3. 更新所有庫存變動
                        for (const pid in productsToUpdate) {
                            const updateInfo = productsToUpdate[pid];
                            const prod = await db.products.get(pid);
                            if (prod) {
                                prod.stock = Number(prod.stock || 0) + updateInfo.change;
                                await db.products.put(prod);
                            }
                        }

                        // 4. 記錄變更歷程
                        const customer = customers.find(c => c.id === cid);
                        const customerName = customer ? customer.name : cid;
                        const action = isEdit ? 'UPDATE' : 'CREATE';
                        const desc = isEdit ? `編輯出貨單 ${tid} (客戶: ${customerName})` : `新增出貨單 ${tid} (客戶: ${customerName})`;
                        
                        const logOld = isEdit ? { customer_id: defaultCid, customer_name: customers.find(c => c.id === defaultCid)?.name || defaultCid, items: existingItems } : null;
                        const logNew = { customer_id: cid, customer_name: customerName, items: newItems };
                        
                        await this.addAuditLog(action, 'sale', tid, desc, logOld, logNew);
                    });
                    
                    this._modalSuccessMsg = isEdit ? '編輯成功' : '新增成功';
                    return true;
                } catch (err) {
                    console.error(err);
                    await this.alert('儲存失敗：' + err.message);
                    return false;
                }
            };
        }

        mBody.innerHTML = html;
        if (postRender) postRender();

        mSave.onclick = async () => {
            if (saveHandler) {
                const success = await saveHandler();
                if (success === true) {
                    this.hideModal();
                    this.showToast(this._modalSuccessMsg || '儲存成功');
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
        document.getElementById('dialog-body').innerHTML = message;
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
    },

    async generateProductSequenceID() {
        const keys = await db.products.toCollection().primaryKeys();
        const cleanKeys = keys.map(k => String(k).split('-')[0]);
        const pattern = /^\d+$/;
        const nums = cleanKeys
            .filter(k => pattern.test(k))
            .map(k => parseInt(k, 10));
        const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
        const nextNum = maxNum + 1;
        return String(nextNum).padStart(7, '0');
    }
};

// Start application
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
