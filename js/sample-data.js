/**
 * Vibe ERP Sample Seed Data
 * Scenario: Scuba Diving Equipment Online Store
 */
const SampleData = {
    _formatID: (prefix, index = 0) => {
        const now = new Date();
        // Offset by index to ensure millisecond uniqueness in simulation
        const t = new Date(now.getTime() + index);
        const y = t.getFullYear();
        const m = String(t.getMonth() + 1).padStart(2, '0');
        const d = String(t.getDate()).padStart(2, '0');
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        const ss = String(t.getSeconds()).padStart(2, '0');
        const ms = String(t.getMilliseconds()).padStart(3, '0');
        return `${prefix}${y}${m}${d}${hh}${mm}${ss}${ms}`;
    },

    getProducts: () => [
        ["產品代碼", "產品名稱", "產品類別", "進貨成本", "預計售價", "庫存量", "供應商ID"],
        ["P001", "Legend Elite 調節器", "重裝", 15000, 28000, 15, "S001"],
        ["P002", "Axiom BCD", "重裝", 12000, 22000, 12, "S001"],
        ["P003", "Reveal X1 面鏡", "面鏡", 800, 1800, 45, "S001"],
        ["P004", "Volo Race 蛙鞋", "蛙鞋", 1500, 3200, 25, "S002"],
        ["P005", "Puck Pro 電腦錶", "電腦錶", 4500, 8500, 18, "S002"],
        ["P006", "Dual ADJ 調節器", "重裝", 8000, 15000, 10, "S002"],
        ["P007", "MK25 EVO/S600", "重裝", 18000, 35000, 8, "S003"],
        ["P008", "Hydros Pro BCD", "重裝", 16000, 29000, 10, "S003"],
        ["P009", "G2 電腦錶", "電腦錶", 22000, 42000, 5, "S003"],
        ["P010", "Paragon 面鏡", "面鏡", 2500, 4800, 20, "S004"],
        ["P011", "Hyflex Switch 蛙鞋", "蛙鞋", 3500, 6500, 15, "S004"],
        ["P012", "Tina BCD", "重裝", 11000, 21000, 10, "S004"],
        ["P013", "Michelangelo 電腦錶", "電腦錶", 5000, 9500, 12, "S005"],
        ["P014", "Thor 蛙鞋", "蛙鞋", 1800, 3600, 30, "S005"],
        ["P015", "Morea 3mm 防寒衣", "防寒衣", 2500, 5200, 40, "S005"],
        ["P016", "i330R 電腦錶", "電腦錶", 6000, 11500, 15, "S001"],
        ["P017", "Avanti Quattro+", "蛙鞋", 2200, 4500, 20, "S002"],
        ["P018", "Frameless 面鏡", "面鏡", 1200, 2500, 25, "S003"],
        ["P019", "Ino 面鏡", "面鏡", 1800, 3800, 15, "S004"],
        ["P020", "Patrol BCD", "重裝", 9000, 18000, 10, "S005"]
    ],

    getSuppliers: () => [
        ["廠商編號", "廠商名稱", "聯絡人", "電話"],
        ["S001", "Aqualung Taiwan", "林先生", "0911-111111"],
        ["S002", "Mares Asia", "陳小姐", "0922-222222"],
        ["S003", "Scubapro HK", "張先生", "0933-333333"],
        ["S004", "Tusa Global", "王小姐", "0944-444444"],
        ["S005", "Cressi Italy", "李先生", "0955-555555"]
    ],

    getCustomers: () => [
        ["客戶編號", "客戶名稱", "電話", "地址"],
        ["C001", "王大明", "0988-001001", "台北市信義路五段7號"],
        ["C002", "李小華", "0988-002002", "台中市西屯區台灣大道三段"],
        ["C003", "張志強", "0988-003003", "高雄市苓雅區四維三路"],
        ["C004", "陳美玲", "0988-004004", "台南市中西區府前路"],
        ["C005", "林俊傑", "0988-005005", "桃園市中壢區中正路"],
        ["C006", "黃品源", "0988-006006", "新竹市東區光復路"],
        ["C007", "蔡依林", "0988-007007", "彰化縣彰化市中山路"],
        ["C008", "趙又廷", "0988-008008", "基隆市仁愛區忠一路"],
        ["C009", "許瑋甯", "0988-009009", "宜蘭縣宜蘭市神農路"],
        ["C010", "彭于晏", "0988-010010", "屏東縣恆春鎮墾丁路"]
    ],

    generatePurchases: (products) => {
        const data = [["進貨單號", "日期", "廠商編號", "產品代碼", "單位成本", "數量", "總金額"]];
        for (let i = 1; i <= 30; i++) {
            const pid = "P" + (Math.floor(Math.random() * 20) + 1).toString().padStart(3, '0');
            const product = products.find(p => p[0] === pid);
            const sid = product[6];
            const cost = product[3];
            const qty = Math.floor(Math.random() * 10) + 5;
            data.push([
                SampleData._formatID('P', i),
                "2024-04-" + (Math.floor(Math.random() * 28) + 1).toString().padStart(2, '0'),
                sid, pid, cost, qty, cost * qty
            ]);
        }
        return data;
    },

    generateSales: (products) => {
        const data = [["出貨單號", "日期", "客戶編號", "產品代碼", "售價單價", "數量", "總金額"]];
        for (let i = 1; i <= 30; i++) {
            const pid = "P" + (Math.floor(Math.random() * 20) + 1).toString().padStart(3, '0');
            const cid = "C" + (Math.floor(Math.random() * 10) + 1).toString().padStart(3, '0');
            const product = products.find(p => p[0] === pid);
            const price = product[4];
            const qty = Math.floor(Math.random() * 3) + 1;
            data.push([
                SampleData._formatID('S', i),
                "2024-05-" + (Math.floor(Math.random() * 8) + 1).toString().padStart(2, '0'),
                cid, pid, price, qty, price * qty
            ]);
        }
        return data;
    }
};
