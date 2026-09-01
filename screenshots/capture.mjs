// Renders each plugin's configPage.html inside a real Jellyfin dashboard and
// writes a PNG into that plugin's repo.
//
// Why a real server rather than a standalone headless render: not one of these
// config pages ships a <style> block. They are styled entirely by jellyfin-web
// and built from emby-input / emby-select / emby-checkbox, which are custom
// elements the dashboard bundle registers at runtime. Loaded on their own they
// render as unstyled browser form controls.
//
// The plugin is never installed. The page markup is grafted onto a dashboard
// route that already has the same layout, with ApiClient stubbed to serve the
// demo values from plugins.json -- which also means the screenshots show chosen
// settings rather than empty defaults, and are byte-identical between runs.

import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startJellyfin, stopJellyfin } from './jellyfin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

// Narrow enough that the dashboard drawer collapses, so the capture is the
// config pane and its header rather than a strip of navigation chrome.
const VIEWPORT = { width: 1000, height: 1400 };

// A dashboard route that renders the same .page.type-interior > .content-primary
// shell that Jellyfin gives a plugin configuration page.
const HOST_ROUTE = '#/dashboard/settings';

function injectConfigPage({ html, config, api, frozenTime }) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const pluginPage = parsed.querySelector('[data-role="page"]');
    if (!pluginPage) {
        throw new Error('config page has no [data-role="page"] root');
    }

    // Timestamps rendered by the page would otherwise change every run and show
    // up as a diff in a PNG that is meant to be stable.
    Date.prototype.toLocaleTimeString = () => frozenTime;

    const settled = value => Promise.resolve(JSON.parse(JSON.stringify(value)));

    Object.assign(window.ApiClient, {
        getPluginConfiguration: () => settled(config),
        updatePluginConfiguration: () => settled({}),
        getVirtualFolders: () => settled(api.getVirtualFolders ?? []),
        getUsers: () => settled(api.getUsers ?? []),
        getSessions: () => settled(api.getSessions ?? []),
        ajax: () => settled({})
    });

    // The loading overlay is modal and would sit on top of the screenshot.
    Object.assign(window.Dashboard, {
        showLoadingMsg: () => {},
        hideLoadingMsg: () => {},
        alert: message => console.error('page called Dashboard.alert:', message),
        processPluginConfigurationUpdateResult: () => {}
    });

    const host = document.querySelector('.page.type-interior');
    if (!host) {
        throw new Error('no host .page.type-interior found on the dashboard route');
    }

    // Scripts inserted via innerHTML never execute, so they are held back and
    // re-created afterwards -- which also guarantees the markup they reach for
    // with getElementById is already in the document.
    const scripts = [...pluginPage.querySelectorAll('script')];
    scripts.forEach(script => script.remove());

    host.id = pluginPage.id;
    // Added, not assigned: the host's own classes include mainAnimatedPage,
    // which is what puts the page in a stacking context above .backgroundContainer.
    // Overwriting them drops the page behind that layer, where anything without a
    // stacking context of its own -- headings, field descriptions, text inputs --
    // is painted over and vanishes from the capture.
    host.classList.add(...pluginPage.classList);
    host.innerHTML = pluginPage.innerHTML;

    for (const script of scripts) {
        const live = document.createElement('script');
        live.textContent = script.textContent;
        host.appendChild(live);
    }

    // Jellyfin drives page initialisation off pageshow; the plugin pages all
    // hang their load handler on it.
    host.dispatchEvent(new Event('pageshow'));

    return host.id;
}

async function capturePlugin(page, plugin, base) {
    const pagePath = resolve(REPO_ROOT, plugin.repo, plugin.page);
    const html = await readFile(pagePath, 'utf8');

    // A goto that only changes the fragment is a same-document navigation, which
    // would leave the previous plugin's scripts, timers and pageshow listeners
    // attached to the host element. The reload forces a fresh JS context.
    await page.goto(`${base}/web/${HOST_ROUTE}`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.page.type-interior .content-primary', { timeout: 20000 });

    const errors = [];
    const onError = message => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    };
    page.on('console', onError);

    await page.evaluate(injectConfigPage, {
        html,
        config: plugin.config ?? {},
        api: plugin.api ?? {},
        frozenTime: '9:41:00 AM'
    });

    // Let the page's own load handler resolve its promises and paint.
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.fonts.ready);

    // Anything the page's init did that moved the viewport -- focusing a field,
    // scrollIntoView -- leaves the capture starting mid-page, and because the
    // dashboard header is fixed and translucent it then paints over the top of
    // the content with whatever was under it blurred through.
    await page.evaluate(() => {
        window.scrollTo(0, 0);
        for (const node of document.querySelectorAll('*')) {
            if (node.scrollTop) {
                node.scrollTop = 0;
            }
        }
    });
    await page.waitForTimeout(200);

    // The .page element stretches to fill the viewport, so screenshotting it
    // directly leaves a tall band of empty background under short config pages.
    // Measuring the furthest-down descendant instead crops to the content, while
    // starting at y=0 keeps the dashboard header and its back arrow in frame.
    const clip = await page.evaluate(() => {
        const host = document.querySelector('.page.type-interior');
        const content = host.querySelector('.content-primary');
        const bottom = [...content.querySelectorAll('*')]
            .map(node => node.getBoundingClientRect().bottom)
            .reduce((lowest, edge) => Math.max(lowest, edge), 0);
        const box = host.getBoundingClientRect();

        return {
            x: box.x + window.scrollX,
            y: 0,
            width: box.width,
            height: bottom + window.scrollY + 24
        };
    });

    const outputPath = resolve(REPO_ROOT, plugin.repo, plugin.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await page.screenshot({ path: outputPath, clip, fullPage: true });

    page.off('console', onError);
    return { outputPath, errors };
}

async function main() {
    const keep = process.argv.includes('--keep');
    const only = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length);

    const manifest = JSON.parse(await readFile(resolve(HERE, 'plugins.json'), 'utf8'));
    const plugins = only
        ? manifest.plugins.filter(plugin => plugin.id === only)
        : manifest.plugins;

    if (!plugins.length) {
        throw new Error(only ? `no plugin with id "${only}" in plugins.json` : 'plugins.json is empty');
    }

    console.log(`Booting Jellyfin (reuse=${keep})...`);
    const server = await startJellyfin({ reuse: keep });
    console.log(`  ${server.base} ${server.reused ? '(reused running container)' : '(fresh container)'}`);

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });

    let failed = false;

    try {
        await page.goto(`${server.base}/web/`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#txtManualName', { timeout: 20000 });
        await page.fill('#txtManualName', server.username);
        await page.fill('#txtManualPassword', server.password);
        await page.click('button.button-submit');
        await page.waitForURL(/#\/home/, { timeout: 20000 });

        for (const plugin of plugins) {
            process.stdout.write(`  ${plugin.id} ... `);
            try {
                const { outputPath, errors } = await capturePlugin(page, plugin, server.base);
                console.log(relative(REPO_ROOT, outputPath));
                for (const error of errors) {
                    console.log(`      page console error: ${error.slice(0, 200)}`);
                }
            } catch (error) {
                failed = true;
                console.log(`FAILED\n      ${error.message}`);
            }
        }
    } finally {
        await browser.close();
        if (!keep) {
            await stopJellyfin();
        } else {
            console.log(`Container left running for reuse (--keep). Stop it with: docker rm -f jellyfin-screenshot-shell`);
        }
    }

    process.exitCode = failed ? 1 : 0;
}

await main();
