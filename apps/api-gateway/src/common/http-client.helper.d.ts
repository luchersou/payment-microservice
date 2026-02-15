import { Observable } from 'rxjs';
import { AxiosResponse } from 'axios';
export declare function makeHttpRequest<T>(observable: Observable<AxiosResponse<T>>, timeoutMs: number, notFoundMessage?: string): Promise<T>;
