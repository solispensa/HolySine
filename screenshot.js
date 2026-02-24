import puppeteer from 'puppeteer';

(async () => {
    try {
        const browser = await puppeteer.launch({
            args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 375, height: 812 });
        await page.goto('http://localhost:5173/');
        console.log("Page loaded");
        await page.click('#start-audio');
        console.log("Audio started");
        await new Promise(r => setTimeout(r, 1000));
        await page.click('[data-view="config-view"]');
        console.log("Config view clicked");
        await new Promise(r => setTimeout(r, 1000));
        await page.screenshot({ path: 'config_view_screenshot.png' });
        console.log("Screenshot taken");
        await browser.close();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
