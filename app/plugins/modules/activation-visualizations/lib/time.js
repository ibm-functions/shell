/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
  * Return a millis time for the start of the given day.
  *
  *    !!! Destructive on the input !!!
  *
  */
const startOfDay = date => {
    date.setHours(0)
    date.setMinutes(0)
    date.setSeconds(0)
    date.setMilliseconds(0)
    return date.getTime()
}

/**
 * Return a range of millis since epoch {since, to}, based on a pretty query
 *
 */
exports.range = options => {
    const date = new Date(), y = date.getFullYear(), m = date.getMonth(), now = date.getTime(),
          oneSecond = 1000,
          oneMinute = 60 * oneSecond,
          oneHour = 60 * oneMinute,
          oneDay = 24 * oneHour,
          startOfToday = startOfDay(date)
          startOfWeek = (startOfToday - date.getDay() * oneDay)

    let since, upto
    if (options.today) {
        since = startOfToday
        upto = now

    } else if (options.yesterday || options.y) {
        since = startOfToday - oneDay
        upto = startOfToday

    /*} else if (A === 'prior') {
        const N = B
        const unit = argv[idx + 2]
        upto = now
        if (N
        if (N === 'day' || unit === 'days' || unit === 'day') {
            since = now - N * oneDay
            } else if (unit === 'we*/
    } else if (options.this === 'month') {
        since = new Date(y, m, 1).getTime()
        upto = new Date(y, m + 1, 0).getTime()

    } else if (options.last === 'month') {
            since = new Date(y, m - 1, 1).getTime()
            upto = new Date(y, m, 0).getTime()

    /*} else if (options['months-ago']) {
        const n = parseInt(options['months-ago'])
        since = new Date(y, m - n, 1).getTime()
        upto = new Date(y, m - n + 1, 0).getTime()*/

    } else if (options.this === 'year') {
        since = new Date(y, 0, 1).getTime()
        upto = new Date(y, 12, 0).getTime()

    } else if (options.last === 'year') {
        since = new Date(y - 1, 0, 1).getTime()
        upto = new Date(y, 0, 0).getTime()

    } else if (options.this === 'week') {
        since = startOfWeek
        upto = now

    } else if (options.last === 'week') {
        since = startOfWeek - 7 * oneDay
        upto = startOfWeek

    /*} else if (options['weeks-ago']) {
        const n = parseInt(options['weeks-ago'])
        since = startOfWeek - n * 7 * oneDay
        upto = startOfWeek - (n - 1) * 7 * oneDay

    } else if (options['minutes-ago']) {
        const n = parseInt(options['minutes-ago'])
        since = now - n * oneMinute
        upto = now

    } else if (options['hours-ago']) {
        const n = parseInt(options['hours-ago'])
        since = now - n * oneHour
        upto = now*/

    } else {
        return
    }

    return { since, upto }
}
