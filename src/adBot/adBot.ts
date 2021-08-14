import { Cluster } from "../cluster";
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import config from './config'
import userAgents from "../utils/userAgents";
import { selectors, skippedResources, blockedResourceTypes } from './utils'

puppeteer.use(StealthPlugin());

const sleep = (ms: number): Promise<any> => new Promise((resolve) => setTimeout(resolve, ms));

const getRandomIntInclusive = (min: number, max: number): number => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const {
  headless,
  concurrencyLimit,
  totalAmount,
  CPM,
  urls
} = config;

const {
  AdVideoAdLabel,
} = selectors;

const url = urls[getRandomIntInclusive(0, urls.length - 1)];
let maxViews = (totalAmount * 1000) / CPM;
let localStorage: any;

(async () => {
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: concurrencyLimit,
        // workerCreationDelay: 5000,
        sameDomainDelay: 3500, 
        timeout: 200000,
        retryLimit: 10,
        monitor: true,
        puppeteer,
        // chromeLauncher: true,
        puppeteerOptions: {
          headless,
          executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
          args: [
            // headless ? '--headless' : '',
            '--disable-client-side-phishing-detection',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--disable-extensions',
            '--no-default-browser-check',
            '--no-first-run',
            '--allow-running-insecure-content',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-features=ScriptStreaming',
            '--disable-hang-monitor',
            '--disable-ipc-flooding-protection',
            '--disable-notifications',
            '--disable-renderer-backgrounding',
            '--disable-background-networking',
            '--disable-breakpad',
            '--disable-component-update',
            '--disable-domain-reliability',
            '--disable-sync',
            // '--use-gl="swiftshader"',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-features=Translate,GpuProcessHighPriorityWin,GpuUseDisplayThreadPriority,ExtensionsToolbarMenu',
            '--disk-cache-size=1',
            '--disable-gpu-program-cache',
            '--disable-gpu-shader-disk-cache',
          ],
        }
    })

    await cluster.task(async ({ page, data: uri }) => {
      const userAgent = userAgents[getRandomIntInclusive(0, userAgents.length - 1)];
    await page.setUserAgent(userAgent);

    // Deal with twitch cookies and unnecessary contests
    const client = await page.target().createCDPSession();

    await client.send('Network.enable');
    await client.send('Network.setRequestInterception', {
      patterns: [{
        urlPattern: '*',
      }],
    });

    client.on('Network.requestIntercepted', async ({
      interceptionId,
      request: httpRequest,
      resourceType,
    }) => {
      const continueParams: any = { interceptionId };
      const requestUrl = httpRequest.url.split('?')[0].split('#')[0];

      if (httpRequest.url === 'https://www.twitch.tv/') {
        continueParams.rawResponse = 'eyBzdGF0dXM6IDIwMCwgY29udGVudFR5cGU6ICd0ZXh0L3BsYWluJywgYm9keTogJzxodG0nICB9';
      } else if (
        blockedResourceTypes.indexOf(resourceType) !== -1
      || skippedResources.some((resource) => requestUrl.indexOf(resource) !== -1)
      ) {
        continueParams.errorReason = 'AddressUnreachable';
      }
      client.send('Network.continueInterceptedRequest', continueParams)
        .catch(() => 'catch')
    });
    // ///////////////////////////////////////

    // set cookies to mute audio and accept mature content
    await page.goto('https://www.twitch.tv/');

    await page.evaluate(() => {
      localStorage.setItem('mature', 'true');
      localStorage.setItem('video-muted', '{"default":false}');
      localStorage.setItem('volume', '0.5');
      localStorage.setItem('video-quality', '{"default":"160p30"}');
    });
    // /////////////////////////////////////////////////

    await page.goto(uri);
    await page.waitForSelector(AdVideoAdLabel, { timeout: 10000 });
    await page.waitForSelector(AdVideoAdLabel, { hidden: true, timeout: 181000 });

    await sleep(
      getRandomIntInclusive(3000, 5000),
    );

    await page.close();
    });

    while (maxViews > 0) {
      cluster.queue(url);
      maxViews -= 1;
    }

    await cluster.idle();
    await cluster.close();
})();