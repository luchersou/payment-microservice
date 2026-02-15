"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeHttpRequest = makeHttpRequest;
const rxjs_1 = require("rxjs");
const common_1 = require("@nestjs/common");
async function makeHttpRequest(observable, timeoutMs, notFoundMessage) {
    try {
        const response = await (0, rxjs_1.firstValueFrom)(observable.pipe((0, rxjs_1.tap)((response) => {
            common_1.Logger.log(`${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        }), (0, rxjs_1.timeout)(timeoutMs), (0, rxjs_1.catchError)((error) => {
            const url = error.config?.url || 'unknown';
            if (error.response?.status === 404 && notFoundMessage) {
                common_1.Logger.warn(`404 Not Found: ${url}`);
                throw new common_1.NotFoundException(notFoundMessage);
            }
            if (error.name === 'TimeoutError') {
                common_1.Logger.error(`Timeout: ${url} (${timeoutMs}ms)`);
                throw new common_1.RequestTimeoutException('Service is unavailable');
            }
            common_1.Logger.error(`HTTP Error: ${url} - ${error.message}`);
            throw new common_1.RequestTimeoutException('Service is unavailable');
        })));
        return response.data;
    }
    catch (error) {
        if (error instanceof common_1.NotFoundException ||
            error instanceof common_1.RequestTimeoutException) {
            throw error;
        }
        throw new Error('Request failed');
    }
}
//# sourceMappingURL=http-client.helper.js.map