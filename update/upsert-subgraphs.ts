import { PrismaClient } from '@prisma/client';
import * as SUBGRAPH_MAP from "../subgraphs.json";
import { queryMultiGraphQL } from './common/queryGraphQL';

interface Investment {
  id: string;
  address: string;
  tag: string;
  inputTokens: string[];
}

async function upsert(allowProjectNotFound: boolean = false) {
  const prisma = new PrismaClient();
  await prisma.investProject.updateMany({
    data: { subgraphUrl: [] },
  });
  const allProjects = await prisma.investProject.findMany({
    select: {
      id: true,
      name: true,
      chainId: true,
      subgraphUrl: true,
      invests: {
        select: {
          id: true,
          address: true,
          tag: true,
          idAtSubgraph: true,
        },
      },
    },
  });

  const projects: {
    id: string;
    chainId: number;
    name: string;
    subgraphUrl: string[];
    invests: {
      id: string;
      address: string;
      tag: string | null;
    }[];
  }[] = [];

  Object.entries(SUBGRAPH_MAP).forEach(([key, subgraphUrl]) => {
    const [chainId, projectName] = key.split('_') as [string, string];

    const project = allProjects.find(
      (p) => p.chainId == +chainId && p.name == projectName,
    );
    if (!project) {
      if (allowProjectNotFound) throw new Error(`Project not found: ${key}`);
      else return;
    }
    projects.push({
      ...project,
      subgraphUrl: convertToStringArray(subgraphUrl),
    });
  });
  // if (projects.length !== Object.keys(SUBGRAPH_MAP).length) {
  //   return;
  // }

  const toUniqueAddresses = (arr: { address: string }[]) =>
    Array.from(new Set(arr.map((s) => s.address.toLowerCase())));
  // find investment Id
  const _investmentsByProjects = projects.map((s, i) => {
    const query = `query {
      investments(
        where:{
          address_in: ["${toUniqueAddresses(s.invests).join('", "')}"]
        }
      ) {
        id
        address
        tag
        inputTokens
      }
    }`;

    return queryMultiGraphQL<
      { investments: Investment[] },
      {
        name: string;
        chainId: number;
        data: { investments: Investment[] };
        errors: any;
      }
    >(convertToStringArray(s.subgraphUrl), query, (res) => ({
      name: s.name,
      chainId: s.chainId,
      data: res.data,
      errors: res.errors,
    }));
  });

  const investmentsByProjects = (
    await Promise.all(_investmentsByProjects)
  ).flat();
  const investments = investmentsByProjects
    .filter((project) => {
      if (project.errors) {
        console.error(
          `Subgraph Indexing Error: ${project.chainId}-${project.name}- ${project.id}`,
        );
        return false;
      }
      if (!project.data) {
        console.error(
          `Subgraph Error: ${project.chainId}-${project.name}- ${project.id}`,
        );
        return false;
      } 
      return true
    })
    .map((res, i) => {
      if (!res?.data?.investments.length) {
        console.log(
          `Investment not found for project: ${res.name} - ${res.chainId} - ${res.id}`,
        );
        return [];
      }
      return res.data.investments;
    });

  // prepare upsert data
  const projectUpdates: { id: string; subgraphUrl: string[] }[] = [];
  const investUpdates: { id: string; subgraphId: string }[] = [];
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];

    projectUpdates.push({
      id: project.id,
      subgraphUrl: convertToStringArray(project.subgraphUrl),
    });

    let notfounds: string[] = [];
    project.invests.forEach((invest) => {
      if (!investments[i]) return;
      const subgraphId = investments[i].find(
        (i) =>
          i.address.toLowerCase() == invest.address.toLowerCase() &&
          i.tag.toLowerCase() == (invest.tag ?? '').toLowerCase(),
      )?.id;

      if (!subgraphId) {
        notfounds.push(invest.address);
      } else {
        investUpdates.push({
          id: invest.id,
          subgraphId,
        });
      }
    });

    console.log(
      `Project: ${project.name} - ${project.chainId} : found ${
        project.invests.length - notfounds.length
      } / ${project.invests.length} investments`,
    );
  }

  await Promise.all([
    ...projectUpdates.map((p) =>
      prisma.investProject.update({
        where: { id: p.id },
        data: { subgraphUrl: p.subgraphUrl },
      }),
    ),
    ...investUpdates.map((i) =>
      prisma.invest.update({
        where: { id: i.id },
        data: { idAtSubgraph: i.subgraphId },
      }),
    ),
  ]);
}
function convertToStringArray(subgraphUrl: string | string[]) {
  return Array.isArray(subgraphUrl) ? subgraphUrl : [subgraphUrl];
}
upsert();
// npm run script:prod update/upsert-subgraphs.ts
// npm run script:stage update/upsert-subgraphs.ts
// npm run script:local update/upsert-subgraphs.ts

// *** SHOULD BE VALIDATED using script at validate-db-subgraph.ts ***
