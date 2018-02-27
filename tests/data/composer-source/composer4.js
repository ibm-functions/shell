const composer = require('@ibm-functions/composer')
composer.try('RandomError', /* catch */ args => ({ message: args.error + ' is caught' }))
