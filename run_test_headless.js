const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    console.log('🚀 正在啟動無頭瀏覽器載入單元測試...');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true
        });
        const page = await browser.newPage();
        
        // 載入 test.html (使用絕對 file:// 路徑)
        const testHtmlPath = 'file://' + path.resolve(__dirname, 'test.html');
        await page.goto(testHtmlPath);
        
        // 等待測試結果 DOM 載入與測試執行完畢
        await page.waitForSelector('#tests-complete', { timeout: 15000 });
        
        // 提取頁面渲染出來的測試案例結果與日誌
        const testResults = await page.evaluate(() => {
            const cases = document.querySelectorAll('.test-case');
            const data = [];
            let hasFail = false;
            
            cases.forEach(c => {
                const title = c.querySelector('h3').innerText;
                const pass = c.classList.contains('pass');
                const log = c.querySelector('.details').innerText;
                if (!pass) hasFail = true;
                
                data.push({ title, pass, log });
            });
            
            return { data, hasFail };
        });
        
        console.log('\n==================================================');
        console.log('🧪 單元測試執行結果摘要');
        console.log('==================================================\n');
        
        testResults.data.forEach((c, idx) => {
            const icon = c.pass ? '✅ PASS' : '❌ FAIL';
            console.log(`[${idx + 1}] ${icon} - ${c.title}`);
            console.log('--------------------------------------------------');
            // 將輸出日誌縮排印出
            console.log(c.log.replace(/^/gm, '    '));
            console.log('--------------------------------------------------\n');
        });
        
        if (testResults.hasFail) {
            console.log('🚨 測試失敗：部分測試案例未通過！');
            process.exit(1);
        } else {
            console.log('🎉 恭喜！所有單元測試皆順利通過！');
            process.exit(0);
        }
    } catch (err) {
        console.error('🚨 執行測試時發生未預期的錯誤：', err);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
})();
