import type { ApiRoutes, OperationId } from '@sims/contracts';
import type { z } from 'zod';

type Route<Id extends OperationId> = ApiRoutes[Id];

/** "/periods/{periodId}/updates/{initiativeId}" → "periodId" | "initiativeId" */
type ParamNames<Path extends string> =
  Path extends `${string}{${infer Name}}${infer Rest}`
    ? Name | ParamNames<Rest>
    : never;

type ParamsInput<Id extends OperationId> = [
  ParamNames<Route<Id>['path']>,
] extends [never]
  ? { params?: never }
  : { params: Record<ParamNames<Route<Id>['path']>, string> };

type QueryInput<Id extends OperationId> =
  Route<Id> extends { query: infer Q extends z.ZodType }
    ? { query?: z.input<Q> }
    : { query?: never };

type BodyInput<Id extends OperationId> =
  Route<Id> extends { body: infer B extends z.ZodType }
    ? { body: z.input<B> }
    : { body?: never };

/** What a call needs: path params, query and body, typed from the contract. */
export type ApiInput<Id extends OperationId> = ParamsInput<Id> &
  QueryInput<Id> &
  BodyInput<Id>;

/** What a call returns (after JSON parsing), typed from the contract. */
export type ApiResult<Id extends OperationId> =
  Route<Id>['response'] extends z.ZodType
    ? z.output<Route<Id>['response']>
    : undefined;

/** Operations that need no input at all can be called without one. */
export type NoInputOperation = {
  [Id in OperationId]: object extends ApiInput<Id> ? Id : never;
}[OperationId];
