// Copyright (c) 2015, EMC Corporation

'use strict';

module.exports = TracerFactory;

TracerFactory.$provide = 'Tracer';
TracerFactory.$inject = [
    'domain',
    'Context',
    'lru-cache',
    '_'
];

function TracerFactory (domain, Context, lru, _) {
    function Tracer () {
        this.cache = lru({
            max: 100,
            dispose: function (key, context) {
                context.dispose();
            }
        });

        Object.defineProperty(this, 'active', {
            get: function () {
                if (domain.active && domain.active.id) {
                    return this.findOrCreateContext(domain.active.id);
                } else {
                    return this.findOrCreateContext();
                }
            }
        });
    }

    Tracer.prototype.findOrCreateContext = function (id, options) {
        var context = this.cache.get(id);

        if (context === undefined) {
            context = new Context(id);

            if (domain.active) {
                context.add(domain.active);
            }

            this.cache.set(context.id, context);
        }

        _.merge(context, options || {});

        return context;
    };

    /**
     * Tracer run executes a callback in the context of a new domain or a domain
     * based on the provided context id.
     */
    Tracer.prototype.run = function (next, id, options) {
        var current = domain.create(),
            context = this.findOrCreateContext(id, options);

        current.id = context.id;

        current.run(function () {
            next();
        });
    };

    /**
     * Tracer middleware creates a domain per request to allow context to be stored
     * and shared between the original request and the downstream call stack.
     */
    Tracer.prototype.middleware = function () {
        var self = this;

        return function (req, res, next) {
            var current = domain.create(),
                context = self.findOrCreateContext();

            // Context Examples:
            // context.set('url', req.url);
            // context.set('method', req.method);
            // context.set('query', req.query);
            // context.set('headers', req.headers);

            current.id = context.id;

            // Add the request/response objects to the domain.
            current.add(req);
            current.add(res);

            // Set a header for clients to use for referencing.
            res.setHeader('X-Trace-Id', context.id);

            // Run the remaining middleware in the context of the domain.
            current.run(function () {
                next();
            });
        };
    };

    return new Tracer();
}
