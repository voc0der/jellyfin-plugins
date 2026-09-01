// Boots a throwaway Jellyfin container, completes the setup wizard over the
// Startup API, and hands back a base URL plus admin credentials.
//
// The container is a rendering surface, not a test fixture: nothing here is
// asserted against, it exists so plugin config pages are laid out by the real
// dashboard stylesheet and the real emby-* custom elements.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export const JELLYFIN_IMAGE = 'jellyfin/jellyfin:10.11.11';
const CONTAINER = 'jellyfin-screenshot-shell';
const PORT = 18096;
const USERNAME = 'demo';
const PASSWORD = 'demo-screenshot-pw';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function docker(...args) {
    const { stdout } = await exec('docker', args);
    return stdout.trim();
}

// Applying the wizard's first step makes the server rewrite its config and
// re-run part of its host startup, during which routes briefly 404. Anything
// that is not a client error worth surfacing gets retried rather than failing
// the run.
async function post(base, path, body, attempts = 20) {
    let lastReason = 'never attempted';

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await fetch(base + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body ?? {})
            });

            if (response.ok) {
                return;
            }

            lastReason = `${response.status} ${(await response.text()).slice(0, 200)}`;
        } catch (error) {
            lastReason = error.message;
        }

        await sleep(1000);
    }

    throw new Error(`POST ${path} failed after ${attempts} attempts (last: ${lastReason})`);
}

// The wizard has to finish before jellyfin-web will serve anything but the
// setup flow, and every step 400s if the one before it did not land, so these
// stay sequential.
async function completeSetupWizard(base) {
    // The wizard endpoints come up after the public info endpoint does.
    await waitForJson(`${base}/Startup/Configuration`, 120000);

    await post(base, '/Startup/Configuration', {
        UICulture: 'en-US',
        MetadataCountryCode: 'US',
        PreferredMetadataLanguage: 'en'
    });
    // Not redundant: POST /Startup/User updates the default administrator, and
    // 404s until this GET has materialised it.
    await fetch(`${base}/Startup/User`);
    await post(base, '/Startup/User', { Name: USERNAME, Password: PASSWORD });
    await post(base, '/Startup/RemoteAccess', {
        EnableRemoteAccess: true,
        EnableAutomaticPortMapping: false
    });
    await post(base, '/Startup/Complete');
}

// A booting Jellyfin answers on its port well before its API is live: during
// migrations it serves an HTML splash page to everything, which parses as
// neither JSON nor an error. Readiness therefore means "returned JSON", not
// "returned 200".
async function waitForJson(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastReason = 'never responded';

    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            const contentType = response.headers.get('content-type') ?? '';

            if (response.ok && contentType.includes('json')) {
                return await response.json();
            }

            lastReason = `${response.status} ${contentType || 'no content-type'}`;
        } catch (error) {
            lastReason = error.message;
        }

        await sleep(1000);
    }

    throw new Error(`${url} never returned JSON within ${timeoutMs}ms (last: ${lastReason})`);
}

async function waitForServer(base, timeoutMs = 180000) {
    return waitForJson(`${base}/System/Info/Public`, timeoutMs);
}

export async function stopJellyfin() {
    await docker('rm', '-f', CONTAINER).catch(() => {});
}

export async function startJellyfin({ reuse = false } = {}) {
    const base = `http://localhost:${PORT}`;

    if (reuse) {
        const running = await docker('ps', '-q', '-f', `name=^${CONTAINER}$`).catch(() => '');
        if (running) {
            const info = await waitForServer(base);
            if (info.StartupWizardCompleted) {
                return { base, username: USERNAME, password: PASSWORD, reused: true };
            }
        }
    }

    await stopJellyfin();

    // No volume mount: the config lives in the container's writable layer and
    // dies with it, so every run starts from an identical blank server.
    await docker(
        'run', '-d',
        '--name', CONTAINER,
        '-p', `${PORT}:8096`,
        JELLYFIN_IMAGE);

    const info = await waitForServer(base);
    if (!info.StartupWizardCompleted) {
        await completeSetupWizard(base);
    }

    return { base, username: USERNAME, password: PASSWORD, reused: false };
}
