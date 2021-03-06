import {scan} from 'scan/scan';
import {showNotification} from 'scan/notification';
import {PageStore} from 'page/page_store';
import {Config} from 'util/config';
import {log} from 'util/log';

const ALARM_ID = 'updatescanner-autoscan';
const ALARM_TIMING = {delayInMinutes: 1, periodInMinutes: 5};
const DEBUG_ALARM_TIMING = {delayInMinutes: 0.1, periodInMinutes: 0.5};

/**
 * Starts the Autoscanner.
 *
 * @returns {Promise} Empty promise that resolves when initialisation is
 * complete.
 */
export async function start() {
  const debug = await Config.loadSingleSetting('debug');
  if (debug) {
    log('Debug enabled - using fast scan times.');
  }

  await stopAlarm();
  startAlarm(debug);
  browser.alarms.onAlarm.addListener((alarm) => onAlarm(alarm));
  return {};
}

/**
 * Start the Autoscanner alarm.
 *
 * @param {boolean} debug - Whether to use shorter debug timings.
 */
function startAlarm(debug) {
  const timing = debug ? DEBUG_ALARM_TIMING : ALARM_TIMING;
  browser.alarms.create(ALARM_ID, timing);
  if (debug) {
    log(`Created alarm with timing delay=${timing.delayInMinutes} mins, ` +
      `period=${timing.periodInMinutes} mins`);
  }
}

/**
 * Stop the Autoscanner alarm.
 */
async function stopAlarm() {
  await browser.alarms.clear(ALARM_ID);
}

/**
 * Callback for when the Autoscanner alarm expires. Checks if any pages need
 * scanning.
 *
 * @param {type} alarm - Alarm object that expired.
 *
 * @returns {Promise} A Promise that resolves when the autoscan is
 * complete. This will be ignored by the caller, but is useful for testing..
 */
async function onAlarm(alarm) {
  if (alarm.name == ALARM_ID) {
    if (await Config.loadSingleSetting('debug')) {
      log('Checking if scan is required...');
    }
    const pageStore = await PageStore.load();
    const scanList = getScanList(pageStore.getPageList());
    if (scanList.length > 0) {
      log(`Pages to autoscan: ${scanList.length}`);
      const newMajorChangeCount = await scan(scanList);
      log(`Autoscan complete, ${newMajorChangeCount} new changes detected.`);

      // If the user has already viewed some changes, don't include in the count
      const changeCount = pageStore.getChangedPageList().length;
      const notifyChangeCount = Math.min(newMajorChangeCount, changeCount);

      if (notifyChangeCount > 0) {
        showNotification(notifyChangeCount);
      }
    }
  }
  return {};
}

/**
 * Determine which pages need to be scanned.
 *
 * @param {Array.<Page|PageFolder>} pageList - List of Pages/PageFolders
 * loaded from storage.
 *
 * @returns {Array.<Page>} List of Page objects that need scanning.
 */
function getScanList(pageList) {
  let scanList = [];
  for (const item of pageList) {
    if (isAutoscanPending(item)) {
      scanList.push(item);
      item.lastAutoscanTime = Date.now();
      item.save();
    }
  }
  return scanList;
}

/**
 * Determine whether it's time to autoscan a page.
 *
 * @param {Page} page - Page to check.
 *
 * @returns {boolean} True if it's time to autoscan the page.
 */
function isAutoscanPending(page) {
  if (page.scanRateMinutes == 0) {
    // Autoscanning is disabled for this page
    return false;
  }
  if (page.lastAutoscanTime === null) {
    return true;
  }
  const timeSinceLastAutoscan = Date.now() - page.lastAutoscanTime;
  return (timeSinceLastAutoscan >= page.scanRateMinutes * 60 * 1000);
}

// Allow private functions to be tested
export const __ = {
  onAlarm: onAlarm,
  isAutoscanPending: isAutoscanPending,
};
