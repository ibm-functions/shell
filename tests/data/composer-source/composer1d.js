exports.main = function() { return composer.try('RandomError', /* catch */ args => ({ message: args.error + ' is caught' })) }
