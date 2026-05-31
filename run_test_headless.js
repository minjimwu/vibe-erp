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
        
        // 讀取檔案狀態並注入至頁面以利 test.html 執行檔案存在性與 DOM 結構驗證
        const fs = require('fs');
        const mydataExists = fs.existsSync(path.resolve(__dirname, 'mydata'));
        const convertScriptExists = fs.existsSync(path.resolve(__dirname, 'convert_old_data.js'));
        const convertedDataExists = fs.existsSync(path.resolve(__dirname, 'js/converted-data.js'));
        const indexHtmlContent = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf8');
        const jsAppContent = fs.readFileSync(path.resolve(__dirname, 'js/app.js'), 'utf8');
        
        await page.evaluateOnNewDocument((mydata, convert, converted, html, jsApp) => {
            window.fsCheck = {
                mydataExists: mydata,
                convertScriptExists: convert,
                convertedDataExists: converted
            };
            window.indexHtmlContent = html;
            window.jsAppContent = jsApp;
        }, mydataExists, convertScriptExists, convertedDataExists, indexHtmlContent, jsAppContent);

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
