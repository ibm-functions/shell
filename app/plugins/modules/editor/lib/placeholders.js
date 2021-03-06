/*
 * Copyright 2018 IBM Corporation
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

exports.javascript = `function main(params) {
   return params
}`

exports.python = `def main(params):
   return { "python": "fun" }`

exports.swift = `func main(params: [String:Any]) -> [String:Any] {
   return params
}`

exports.php = `<?php
function main(array $args) : array
{
    $name = $args["name"] ?? "stranger";
    $greeting = "Hello $name!";
    echo $greeting;
    return ["greeting" => $greeting];
}`

exports.composition = {
    javascript: `// try typing "composer." to begin your composition
`,

    python: `# try typing "composer." to begin your composition
`
}
