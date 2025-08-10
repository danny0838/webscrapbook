/**
 * A JavaScript implementation for POSIX strftime().
 *
 * ref: https://pubs.opengroup.org/onlinepubs/9699919799/functions/strftime.html
 *
 * Revised from the version by T. H. Doan (https://thdoan.github.io/strftime/)
 *
 * Copyright Danny Lin 2020-2024
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 */
(function (global, factory) {
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(factory);
  } else {
    // Browser globals
    global = typeof globalThis !== "undefined" ? globalThis : global || self;
    global.Strftime = factory();
  }
}(this, function () {

'use strict';

const MAIN_PATTERN = /%([a-z%])/gi;
const DAY_COUNT = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

class Strftime {
  constructor({
    date,
    isUtc = false,
    space = '',
  } = {}) {
    this.date = (date instanceof Date) ? date : new Date();
    this.isUtc = isUtc;
    this.space = space;
    this._formatKey = (_, key) => (this.formatKey(key) || `%${key}`);
  }

  get nSeconds() {
    const value = this.isUtc ? this.date.getUTCSeconds() : this.date.getSeconds();
    Object.defineProperty(this, 'nSeconds', {
      value,
      writable: false,
      configurable: true,
    });
    return this.nSeconds;
  }

  get nMinutes() {
    const value = this.isUtc ? this.date.getUTCMinutes() : this.date.getMinutes();
    Object.defineProperty(this, 'nMinutes', {
      value,
      writable: false,
      configurable: true,
    });
    return this.nMinutes;
  }

  get nHours() {
    const value = this.isUtc ? this.date.getUTCHours() : this.date.getHours();
    Object.defineProperty(this, 'nHours', {
      value,
      writable: false,
      configurable: true,
    });
    return this.nHours;
  }

  get nDay() {
    const value = this.isUtc ? this.date.getUTCDay() : this.date.getDay();
    Object.defineProperty(this, 'nDay', {
      value,
      writable: false,
      configurable: true,
    });
    return this.nDay;
  }

  get nDate() {
    const value = this.isUtc ? this.date.getUTCDate() : this.date.getDate();
    Object.defineProperty(this, 'nDate', {
      value,
      writable: false,
      configurable: true,
    });
    return this.nDate;
  }

  get nMonth() {
    const value = this.isUtc ? this.date.getUTCMonth() : this.date.getMonth();
    Object.defineProperty(this, 'nMonth', {
      value,
      writable: false,
      configurable: true,
    });
    return this.nMonth;
  }

  get nYear() {
    const value = this.isUtc ? this.date.getUTCFullYear() : this.date.getFullYear();
    Object.defineProperty(this, 'nYear', {
      value,
      writable: false,
      configurable: true,
    });
    return this.nYear;
  }

  get isLeapYear() {
    const value = (this.nYear % 4 === 0 && this.nYear % 100 !== 0) || this.nYear % 400 === 0;
    Object.defineProperty(this, 'isLeapYear', {
      value,
      writable: false,
      configurable: true,
    });
    return this.isLeapYear;
  }

  /**
   * Get day of the year.
   */
  get yearDay() {
    const value = DAY_COUNT[this.nMonth] + this.nDate + ((this.nMonth > 1 && this.isLeapYear) ? 1 : 0);
    Object.defineProperty(this, 'yearDay', {
      value,
      writable: false,
      configurable: true,
    });
    return this.yearDay;
  }

  /**
   * Get week number of the year, with Sunday as the first week day.
   *
   * ref: https://github.com/samsonjs/strftime
   */
  get yearWeek() {
    const weekday = this.nDay;
    const value = Math.floor((this.yearDay + 7 - weekday) / 7);
    Object.defineProperty(this, 'yearWeek', {
      value,
      writable: false,
      configurable: true,
    });
    return this.yearWeek;
  }

  /**
   * Get week number of the year, with Monday as the first week day.
   */
  get yearWeek1() {
    const weekday = this.mod(this.nDay - 1, 7);
    const value = Math.floor((this.yearDay + 7 - weekday) / 7);
    Object.defineProperty(this, 'yearWeek1', {
      value,
      writable: false,
      configurable: true,
    });
    return this.yearWeek1;
  }

  /**
   * Get the revised Date object according to ISO 8601:2000 standard.
   *
   * In this system, week 1 of the year is the week that includes January
   * 4th, which is also the week that includes the first Thursday of the
   * year, and is also the first week that contains at least four days in
   * the year.
   */
  get isoDate() {
    const target = new Date(this.date);
    target.setDate(this.nDate - ((this.nDay + 6) % 7) + 3);
    const value = target;
    Object.defineProperty(this, 'isoDate', {
      value,
      writable: false,
      configurable: true,
    });
    return this.isoDate;
  }

  /**
   * Get week number of the year according to ISO 8601:2000 standard.
   */
  get isoYearWeek() {
    const target = new Date(this.isoDate);
    const n1stThu = target.valueOf();
    target[this.isUtc ? 'setUTCMonth' : 'setMonth'](0, 1);
    const nJan1 = target[this.isUtc ? 'getUTCDay' : 'getDay']();
    if (nJan1 !== 4) { target[this.isUtc ? 'setUTCMonth' : 'setMonth'](0, 1 + ((4 - nJan1) + 7) % 7); }
    const value = 1 + Math.ceil((n1stThu - target) / 604800000);
    Object.defineProperty(this, 'isoYearWeek', {
      value,
      writable: false,
      configurable: true,
    });
    return this.isoYearWeek;
  }

  mod(a, n) {
    return a - (n * Math.floor(a / n));
  }

  padStart(number, width, padder = '0') {
    number = number.toString(10);
    return number.length >= width ? number : padder.repeat(width - number.length) + number;
  }

  format_a() {
    return this.date.toLocaleString(undefined, {
      weekday: 'short',
      timeZone: this.isUtc ? 'UTC' : undefined,
    });
  }

  format_A() {
    return this.date.toLocaleString(undefined, {
      weekday: 'long',
      timeZone: this.isUtc ? 'UTC' : undefined,
    });
  }

  format_b() {
    return this.date.toLocaleString(undefined, {
      month: 'short',
      timeZone: this.isUtc ? 'UTC' : undefined,
    });
  }

  format_B() {
    return this.date.toLocaleString(undefined, {
      month: 'long',
      timeZone: this.isUtc ? 'UTC' : undefined,
    });
  }

  format_c() {
    return this.date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: this.isUtc ? 'UTC' : undefined,
    });
  }

  format_C() {
    return Math.floor(this.nYear / 100);
  }

  format_d() {
    return this.padStart(this.nDate, 2);
  }

  format_D() {
    return this.format('%m/%d/%y');
  }

  format_e() {
    return this.padStart(this.nDate, 2, this.space);
  }

  format_F() {
    return this.format('%Y-%m-%d');
  }

  format_g() {
    return this.isoDate[this.isUtc ? 'getUTCFullYear' : 'getFullYear']().toString().slice(-2);
  }

  format_G() {
    return this.isoDate[this.isUtc ? 'getUTCFullYear' : 'getFullYear']();
  }

  format_h() {
    return this.format_b();
  }

  format_H() {
    return this.padStart(this.nHours, 2);
  }

  format_I() {
    return this.padStart((this.nHours + 11) % 12 + 1, 2);
  }

  format_j() {
    return this.padStart(this.yearDay, 3);
  }

  format_l() {
    return (this.nHours + 11) % 12 + 1;
  }

  format_m() {
    return this.padStart(this.nMonth + 1, 2);
  }

  format_M() {
    return this.padStart(this.nMinutes, 2);
  }

  format_n() {
    return '\n';
  }

  format_p() {
    return (this.nHours < 12) ? 'AM' : 'PM';
  }

  format_P() {
    return (this.nHours < 12) ? 'am' : 'pm';
  }

  format_r() {
    return this.format('%I:%M:%S %p');
  }

  format_R() {
    return this.format('%H:%M');
  }

  format_s() {
    return Math.round(this.date.getTime() / 1000);
  }

  format_S() {
    return this.padStart(this.nSeconds, 2);
  }

  format_t() {
    return '\t';
  }

  format_T() {
    return this.format('%H:%M:%S');
  }

  format_u() {
    return this.nDay || 7;
  }

  format_U() {
    return this.padStart(this.yearWeek, 2);
  }

  format_V() {
    return this.padStart(this.isoYearWeek, 2);
  }

  format_w() {
    return this.nDay;
  }

  format_W() {
    return this.padStart(this.yearWeek1, 2);
  }

  format_x() {
    return this.date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeZone: this.isUtc ? 'UTC' : undefined,
    });
  }

  format_X() {
    return this.date.toLocaleString(undefined, {
      timeStyle: 'medium',
      timeZone: this.isUtc ? 'UTC' : undefined,
    });
  }

  format_y() {
    return (this.nYear + '').slice(-2);
  }

  format_Y() {
    return this.nYear;
  }

  format_z() {
    return this.isUtc ? '+0000' : this.date.toTimeString().replace(/.+GMT([+-]\d+).+/, '$1');
  }

  format_Z() {
    return this.isUtc ? 'UTC' : this.date.toTimeString().replace(/[^()]+\(([^()]+)\)$/, '$1');
  }

  formatKey(key) {
    const fn = this[`format_${key}`];
    if (typeof fn === 'function') { return fn.call(this).toString(); }
    if (key === '%') { return '%'; }
    return '';
  }

  format(str) {
    return str.replace(MAIN_PATTERN, this._formatKey);
  }

  static format(str, options) {
    const formatter = new Strftime(options);
    return formatter.format(str);
  }
}

return Strftime;

}));
