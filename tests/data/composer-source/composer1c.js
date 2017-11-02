const main = () => composer.try('RandomError', /* catch */ args => ({ message: args.error + ' is caught' }))
