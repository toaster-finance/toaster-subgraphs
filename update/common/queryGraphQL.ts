import axios from 'axios';

export async function queryGraphQL<T>(endpoint: string, query: string) {
  return axios
    .post<{ data: T; errors: any }>(endpoint, {
      operationName: 'Q',
      query,
    })
    .then((res) => res.data);
}

export async function queryMultiGraphQL<T,Q>(endpoints: string[], query: string, callback:(res: {data: T, errors:any})=> Q) {
  return Promise.all(
    endpoints.map((endpoint,i) => queryGraphQL<T>(endpoint, query).then((res)=>{ return {...callback(res), id : i + 1}})),
  );
}