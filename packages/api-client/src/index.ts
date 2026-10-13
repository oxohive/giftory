export class ApiError extends Error { constructor(public status: number, message: string, public fields?: Record<string, string[]>) { super(message); this.name = 'ApiError' } }
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
 const response = await fetch('/api/om/' + path, { ...options, cache: 'no-store', headers: { ...(options.body && !(options.body instanceof FormData) ? {'Content-Type':'application/json'} : {}), ...options.headers } })
 const body = await response.json().catch(() => ({}))
 if (!response.ok) throw new ApiError(response.status, response.status === 401 ? 'Your session has expired. Please sign in again.' : response.status === 403 ? 'You do not have permission to perform this action.' : response.status === 429 ? 'Too many attempts. Please wait before trying again.' : body.error || 'The request failed. Please try again.', body.fieldErrors)
 return body as T
}
export interface PageResult<T> {items:T[];total:number;page:number;pageSize:number}
export interface DealerProfile {id:string;businessName:string;contactEmail:string;phone:string;businessType:string;city:string;state:string;pincode:string;kycStatus:'pending_verification'|'under_review'|'approved'|'rejected';rejectionReason:string|null;documents?: {id:string;documentType:string;fileName:string;uploadedAt:string}[]}
export interface Capability {productTypeCodes:string[];printingMethods:string[];maxDailyCapacity:number;serviceableStates:string[];minOrderQty:number}
export interface Assignment {id:string;orderId:string;status:string;requiredBy:string|null;assignedAt:string;statusUpdatedAt:string;statusNote:string|null;cancelledReason:string|null}
export interface Earnings {id:string;orderId:string;assignmentId:string;subtotalAmount:number;currencyCode:string;commissionRateBps:number;commissionAmount:number;snapshottedAt:string}
