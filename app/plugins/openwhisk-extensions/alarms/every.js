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
 * This plugin introduces /wsk/rules/every, to simplify the creation
 * of periodic rules.
 *
 *   every 5s do foo
 *   every 3h 5m do foo
 *
 */

const parse = require('parse-duration'),
      MILLIS_PER_SECOND = 1000,
      SECONDS_PER_MINUTE = 60,
      MILLIS_PER_MINUTE = MILLIS_PER_SECOND * SECONDS_PER_MINUTE,
      MINUTES_PER_HOUR = 60

module.exports = (commandTree, require) => {

    const doEvery = (block, nextBlock, argv, modules) => {
        const actionName = argv[argv.length - 1]
        const timeSpec = argv.slice(1, argv.length - 2)
        const timeSpecString = timeSpec.join(' ')
        const duration = parse(timeSpecString)

        const durationInSeconds = duration / MILLIS_PER_SECOND
        const cron = `*/${durationInSeconds} * * * * *`;

        const triggerName = `every_${timeSpec.join('_')}`,
              ruleName = `${triggerName}_do_${actionName}`,
              safeTimeSpec = timeSpecString.replace(/"/,'').replace(/'/,'') // no quotes

        return repl.qexec(`wsk trigger get ${triggerName}`, null, null, { noRetry: true })
            .catch(notFound => {
                return repl.qexec(`wsk trigger update ${triggerName} -a feed /whisk.system/alarms/alarm -a pretty "every ${safeTimeSpec}"`, block)
                    .then(trigger => repl.qexec(`wsk trigger create ${triggerName} --feed /whisk.system/alarms/alarm -p cron "${cron}"`, block)
                          .then(() => trigger))
            })
            .then(trigger => repl.qfexec(`wsk rule update ${ruleName} ${triggerName} ${actionName}`, block))
    }
    
    // install the routes
    commandTree.listen('/wsk/every', doEvery, { docs: 'Execute an OpenWhisk action periodically; e.g. "every 5 sec do foo"' })
    //commandTree.listen('/wsk/never', doEvery, { docs: 'Remove a periodic execution; e.g. "never 5 sec do foo"' })
}
