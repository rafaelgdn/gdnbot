import { Cluster } from "../cluster";
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import config from './config'

puppeteer.use(StealthPlugin());

// const getRandomIntInclusive = (min: number, max: number) => {
//   min = Math.ceil(min);
//   max = Math.floor(max);
//   return Math.floor(Math.random() * (max - min + 1)) + min;
// };

const {
  concurrency,
  totalAmount,
  CPM,
  urls
} = config;

// const url = urls[getRandomIntInclusive(0, urls.length - 1)];

(async () => {
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_BROWSER,
        maxConcurrency: concurrency,
        workerCreationDelay: 5000,
        timeout: 200000,
        retryLimit: 1000,
        monitor: true,
        puppeteer,
        chromeLauncher: true
    })

    await cluster.task(async ({ page, data: uri }) => {
      await page.goto(uri)
    });

    cluster.queue('https://www.teamplay.com.br')

    await cluster.idle();
    await cluster.close();
})();