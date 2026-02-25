import puppeteer from 'puppeteer';

import path from 'path';

(async () => {
    try {
        const browser = await puppeteer.launch({
            args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 375, height: 812 });
        const fileUrl = 'file:///' + path.resolve('standalone.html').replace(/\\/g, '/');
        await page.goto(fileUrl);
        console.log("Page loaded");
        await page.click('#start-audio');
        console.log("Audio started");
        await new Promise(r => setTimeout(r, 1000));

        await page.click('#analyzer-toggle-btn');
        console.log("Analyzer toggle clicked");
        await new Promise(r => setTimeout(r, 1000));

        await page.screenshot({ path: 'analyzer_screenshot.png' });
        console.log("Screenshot taken");
        await browser.close();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
