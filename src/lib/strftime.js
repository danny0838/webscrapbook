/**
 * A JavaScript implementation for POSIX strftime().
 *
 * ref: https://pubs.opengroup.org/onlinepubs/9699919799/functions/strftime.html
 *
 * Revised from the version by T. H. Doan (https://thdoan.github.io/strftime/)
 *
 * Copyright Danny Lin 2020
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // CommonJS
    module.exports = factory(Date);
  } else {
    // Browser globals
    root.strftime = factory(Date);
  }
}(this, function (Date) {

  'use strict';

  var date;
  var nDay;
  var nDate;
  var nMonth;
  var nYear;
  var nHour;
  var aDayCount = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  var map = {
    '%a': function () { return date.toLocaleString(undefined, {weekday: 'short'}); },
    '%A': function () { return date.toLocaleString(undefined, {weekday: 'long'}); },
    '%b': function () { return date.toLocaleString(undefined, {month: 'short'}); },
    '%B': function () { return date.toLocaleString(undefined, {month: 'long'}); },
    '%c': function () { return date.toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'medium'}); },
    '%C': function () { return Math.floor(nYear/100); },
    '%d': function () { return padStart(nDate, 2); },
    '%D': function () { return format('%m/%d/%y'); },
    '%e': function () { return padStart(nDate, 2, ' '); },
    '%F': function () { return format('%Y-%m-%d'); },
    '%g': function () { return (getIsoDate().getFullYear() + '').slice(2); },
    '%G': function () { return getIsoDate().getFullYear(); },
    '%h': function () { return map['%b'](); },
    '%H': function () { return padStart(nHour, 2); },
    '%I': function () { return padStart((nHour + 11) % 12 + 1, 2); },
    '%j': function () { return padStart(aDayCount[nMonth] + nDate + ((nMonth > 1 && isLeapYear()) ? 1 : 0), 3); },
    '%l': function () { return (nHour + 11) % 12 + 1; },
    '%m': function () { return padStart(nMonth + 1, 2); },
    '%M': function () { return padStart(date.getMinutes(), 2); },
    '%n': function () { return '\n'; },
    '%p': function () { return (nHour < 12) ? 'AM' : 'PM'; },
    '%P': function () { return (nHour < 12) ? 'am' : 'pm'; },
    '%r': function () { return format('%I:%M:%S %p'); },
    '%R': function () { return format('%H:%M'); },
    '%s': function () { return Math.round(date.getTime() / 1000); },
    '%S': function () { return padStart(date.getSeconds(), 2); },
    '%t': function () { return '\t'; },
    '%T': function () { return format('%H:%M:%S'); },
    '%u': function () { return nDay || 7; },
    '%U': function () { return padStart(getWeeks('sunday'), 2); },
    '%V': function () { return getIsoWeeks(); },
    '%w': function () { return nDay; },
    '%W': function () { return padStart(getWeeks('monday'), 2); },
    '%x': function () { return date.toLocaleString(undefined, {dateStyle: 'medium'}); },
    '%X': function () { return date.toLocaleString(undefined, {timeStyle: 'medium'}); },
    '%y': function () { return (nYear + '').slice(2); },
    '%Y': function () { return nYear; },
    '%z': function () { return date.toTimeString().replace(/.+GMT([+-]\d+).+/, '$1'); },
    '%Z': function () { return date.toTimeString().replace(/[^()]+\(([^()]+)\)$/, '$1'); },
    '%%': function () { return '%'; }
  };

  function padStart(number, width, padder) {
    padder = padder || "0";
    number = number.toString(10);
    return number.length >= width ? number : new Array(width - number.length + 1).join(padder) + number;
  }

  function isLeapYear() {
    return (nYear % 4 === 0 && nYear % 100 !== 0) || nYear % 400 === 0;
  }

  function getIsoDate() {
    var target = new Date(date);
    target.setDate(nDate - ((nDay + 6) % 7) + 3);
    return target;
  }

  function getIsoWeeks() {
    var target = getIsoDate(),
        n1stThu = target.valueOf();
    target.setMonth(0, 1);
    var nJan1 = target.getDay();
    if (nJan1 !== 4) { target.setMonth(0, 1 + ((4 - nJan1) + 7) % 7) };
    return padStart(1 + Math.ceil((n1stThu - target) / 604800000), 2);
  }

  // firstWeekday: 'sunday' or 'monday', default is 'sunday'
  // https://github.com/samsonjs/strftime
  function getWeeks(firstWeekday) {
    firstWeekday = firstWeekday || 'sunday';

    // This works by shifting the weekday back by one day if we
    // are treating Monday as the first day of the week.
    var weekday = nDay;
    if (firstWeekday === 'monday') {
      if (weekday === 0) { // Sunday
        weekday = 6;
      } else {
        weekday--;
      }
    }

    var firstDayOfYearUtc = Date.UTC(nYear, 0, 1),
        dateUtc = Date.UTC(nYear, nMonth, nDate),
        yday = Math.floor((dateUtc - firstDayOfYearUtc) / 86400000),
        weekNum = (yday + 7 - weekday) / 7;

    return Math.floor(weekNum);
  }

  function format(str) {
    return str.replace(/%[a-z%]/gi, function (match) {
      return ((map[match]() || '') + '') || match;
    });
  }

  function strftime(str, aDate) {
    date = (aDate instanceof Date) ? aDate : new Date();
    nDay = date.getDay(),
    nDate = date.getDate(),
    nMonth = date.getMonth(),
    nYear = date.getFullYear(),
    nHour = date.getHours();
    return format(str);
  }

  return strftime;

}));
