import * as autoscan from 'scan/autoscan';
import * as scan from 'scan/scan';
import * as notification from 'scan/notification';
import {PageStore} from 'page/page_store';
import {Page} from 'page/page';
import {Config} from 'util/config';
import {Storage} from 'util/storage';
import * as log from 'util/log';

describe('autoscan', function() {
  beforeEach(function() {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(1978, 11, 5, 4, 30));

    spyOn(Storage, 'addListener');
  });

  afterEach(function() {
    jasmine.clock().uninstall();
  });

  describe('start', function() {
    beforeEach(function() {
      this._browser = window.browser;
      window.browser = {alarms: {create: {}, clear: {},
                                 onAlarm: {addListener: {}}}};
      this.calls = [];
      spyOn(browser.alarms, 'create').and.callFake(() => {
        this.calls.push('create');
      });
      spyOn(browser.alarms, 'clear').and.callFake(() => {
        this.calls.push('clear');
      });
      spyOn(browser.alarms.onAlarm, 'addListener');
    });

    afterEach(function() {
      window.browser = this._browser;
    });

    it('clears existing alarms then configures a new alarm', function(done) {
      spyOn(Config, 'loadSingleSetting').and.returnValues(
        Promise.resolve(false));

      autoscan.start().then(() => {
        expect(this.calls).toEqual(['clear', 'create']);
        done();
      }).catch((error) => done.fail(error));
    });

    it('uses normal delays when the debug flag is clear', function(done) {
      spyOn(Config, 'loadSingleSetting').and.returnValues(
        Promise.resolve(false));

      autoscan.start().then(() => {
        expect(browser.alarms.create).toHaveBeenCalledWith(
          'updatescanner-autoscan',
          {delayInMinutes: 1, periodInMinutes: 5});
        done();
      }).catch((error) => done.fail(error));
    });

    it('uses short delays when the debug flag is set', function(done) {
      spyOn(log, 'log');
      spyOn(Config, 'loadSingleSetting').and.returnValues(
        Promise.resolve(true));

      autoscan.start().then(() => {
        expect(browser.alarms.create).toHaveBeenCalledWith(
          'updatescanner-autoscan',
          {delayInMinutes: 0.1, periodInMinutes: 0.5});
        done();
      }).catch((error) => done.fail(error));
    });
  });

  describe('onAlarm', function() {
    beforeEach(function() {
      spyOn(PageStore, 'load').and.returnValue(
        Promise.resolve(new PageStore(new Map())));
      spyOn(Config, 'loadSingleSetting').and.returnValue(
        Promise.resolve(false));
      spyOn(notification, 'showNotification');
    });

    it('does nothing if the alarm name doesn\'t match', function() {
      spyOn(scan, 'scan').and.returnValues(Promise.resolve());
      spyOn(console, 'log');

      autoscan.__.onAlarm({name: 'illegal-alarm'});

      expect(PageStore.load).not.toHaveBeenCalled();
      expect(scan.scan).not.toHaveBeenCalled();
    });

    it('scans a pending page', function(done) {
      const pages = [new Page(1, {url: 'http://example.com',
                                    scanRateMinutes: 15,
                                    lastAutoscanTime: Date.now()}),
                    ];
      spyOn(PageStore.prototype, 'getPageList').and.returnValues(pages);
      spyOn(Page.prototype, 'save');
      spyOn(scan, 'scan').and.returnValues(Promise.resolve());
      spyOn(console, 'log');
      jasmine.clock().tick(20 * 60 * 1000);

      autoscan.__.onAlarm({name: 'updatescanner-autoscan'}).then(() => {
        expect(scan.scan).toHaveBeenCalledWith(pages);
        done();
      }).catch((error) => done.fail(error));
    });

    it('scans two pending pages', function(done) {
      const pages = [new Page(1, {url: 'http://example.com',
                                  scanRateMinutes: 15,
                                  lastAutoscanTime: Date.now()}),
                     new Page(2, {url: 'http://test.com',
                                  scanRateMinutes: 30,
                                  lastAutoscanTime: Date.now()}),
                    ];
      spyOn(PageStore.prototype, 'getPageList').and.returnValues(pages);
      spyOn(Page.prototype, 'save');
      spyOn(scan, 'scan').and.returnValues(Promise.resolve());
      spyOn(console, 'log');

      jasmine.clock().tick(60 * 60 * 1000);

      autoscan.__.onAlarm({name: 'updatescanner-autoscan'}).then(() => {
        expect(scan.scan).toHaveBeenCalledWith(pages);
        done();
      }).catch((error) => done.fail(error));
    });

    it('scans a pending page and ignores a non-pending page', function(done) {
      const pageToScan = new Page(1, {url: 'http://example.com',
                                      scanRateMinutes: 15,
                                      lastAutoscanTime: Date.now()});
      const pageNotToScan = new Page(2, {url: 'http://test.com',
                                         scanRateMinutes: 30,
                                         lastAutoscanTime: Date.now()});
      const pages = [pageToScan, pageNotToScan];

      spyOn(PageStore.prototype, 'getPageList').and.returnValues(pages);
      spyOn(Page.prototype, 'save');
      spyOn(scan, 'scan').and.returnValues(Promise.resolve());
      spyOn(console, 'log');

      jasmine.clock().tick(20 * 60 * 1000);

      autoscan.__.onAlarm({name: 'updatescanner-autoscan'}).then(() => {
        expect(scan.scan).toHaveBeenCalledWith([pageToScan]);
        done();
      }).catch((error) => done.fail(error));
    });

    it('updates lastAutoscanTime when a page is scanned', function(done) {
      const pages = [new Page(1, {url: 'http://example.com',
                                    scanRateMinutes: 15,
                                    lastAutoscanTime: Date.now()}),
                    ];
      spyOn(PageStore.prototype, 'getPageList').and.returnValues(pages);
      spyOn(scan, 'scan').and.returnValues(Promise.resolve());
      spyOn(console, 'log');
      jasmine.clock().tick(20 * 60 * 1000);

      let savedLastAutoscanTime = null;
      spyOn(Page.prototype, 'save').and.callFake(() => {
        savedLastAutoscanTime = pages[0].lastAutoscanTime;
      });

      autoscan.__.onAlarm({name: 'updatescanner-autoscan'}).then(() => {
        expect(Page.prototype.save).toHaveBeenCalled();
        expect(savedLastAutoscanTime).toEqual(Date.now());
        done();
      }).catch((error) => done.fail(error));
    });

    it('doesn\'t update lastAutoscanTime if a page is skipped', function(done) {
      const pages = [new Page(1, {url: 'http://example.com',
                                    scanRateMinutes: 30,
                                    lastAutoscanTime: Date.now()}),
                    ];
      spyOn(PageStore.prototype, 'getPageList').and.returnValues(pages);
      spyOn(scan, 'scan').and.returnValues(Promise.resolve());
      spyOn(console, 'log');
      jasmine.clock().tick(20 * 60 * 1000);

      spyOn(Page.prototype, 'save');

      autoscan.__.onAlarm({name: 'updatescanner-autoscan'}).then(() => {
        expect(Page.prototype.save).not.toHaveBeenCalled();
        done();
      }).catch((error) => done.fail(error));
    });
  });

  describe('isAutoscanPending', function() {
    it('returns true if an autoscan is just pending', function() {
      const page = new Page(1, {
        lastAutoscanTime: Date.now(),
        scanRateMinutes: 5});
      jasmine.clock().tick(5 * 60 * 1000 + 1);

      expect(autoscan.__.isAutoscanPending(page)).toBeTruthy();
    });

    it('returns false if an autoscan is not quite pending', function() {
      const page = new Page(1, {
        lastAutoscanTime: Date.now(),
        scanRateMinutes: 5});
      jasmine.clock().tick(5 * 60 * 1000 - 1);

      expect(autoscan.__.isAutoscanPending(page)).toBeFalsy();
    });

    it('returns false if autoscan is disabled for the page', function() {
      const page = new Page(1, {
        lastAutoscanTime: Date.now(),
        scanRateMinutes: 0});
      jasmine.clock().tick(5 * 60 * 1000);

      expect(autoscan.__.isAutoscanPending(page)).toBeFalsy();
    });

    it('returns true if the page has not yet been scanned', function() {
      const page = new Page(1, {scanRateMinutes: 5});

      expect(autoscan.__.isAutoscanPending(page)).toBeTruthy();
    });
  });
});
