import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { queryGraphQL } from "./common/queryGraphQL";

// .env 파일에서 환경 변수를 로드합니다.
config();

/**
 * This script is used to validate the data in the database.
 *
 * Subgraph에서 유지하는 inputAssets와 rewardAssets의 순서가
 * db에 저장되어있는 순서와 일치하는지 확인한다.
 */

function arraysEqual(a: string[], b: string[]) {
  return (
    a.length == b.length &&
    a.every((v, i) => v.toLowerCase() == b[i].toLowerCase())
  );
}

async function validateDbSubgraph() {
  const prisma = new PrismaClient();
  const _allProjects = await prisma.investProject.findMany({
    select: {
      id: true,
      name: true,
      chainId: true,
      subgraphUrl: true,
      invests: {
        select: {
          id: true,
          name: true,
          idAtSubgraph: true,
          inputAssets: true,
          rewardAssets: true,
        },
      },
    },
  });
  const allProjects = _allProjects.filter((p) => p.subgraphUrl.length !== 0);
  const subgraphInvestments = await Promise.all(
    allProjects.flatMap((p) => {
      const query = `query {
        investments(
            where: { 
                id_in: [${p.invests.map((i) => `"${i.idAtSubgraph}"`).join()}] 
            }
        ){
            id
            inputTokens
            rewardTokens
        }
    }`;
      return p.subgraphUrl.map((sl) =>
        queryGraphQL<{
          investments: {
            id: string;
            inputTokens: string[];
            rewardTokens: string[];
          }[];
        }>(sl!, query)
      );
    })
  );

  subgraphInvestments
    .filter((i) => !i.errors)
    .forEach((r, i) => {
      const project = allProjects[i];
      const dbInvestments = project.invests;

      r.data.investments.forEach((subgraphInvestment) => {
        const dbInvestment = dbInvestments.find(
          (i) => i.idAtSubgraph == subgraphInvestment.id
        );

        if (!dbInvestment) {
          console.error(
            `Investment not found in DB: ${project.name} - ${subgraphInvestment.id}`
          );
          return;
        }

        if (
          !arraysEqual(dbInvestment.inputAssets, subgraphInvestment.inputTokens)
        ) {
          console.error(
            `Input assets not equal: ${project.name} - ${subgraphInvestment.id}:: ${dbInvestment.inputAssets} - ${subgraphInvestment.inputTokens}`
          );
          return;
        }

        if (
          !arraysEqual(
            dbInvestment.rewardAssets,
            subgraphInvestment.rewardTokens
          )
        ) {
          console.error(
            `Reward assets not equal: ${project.name} - ${subgraphInvestment.id}:: ${dbInvestment.rewardAssets} - ${subgraphInvestment.rewardTokens}`
          );
          return;
        }

        console.log(
          `Validated: ${project.name},${project.chainId},Investment: ${dbInvestment.name}`
        );
      });
    });
}

validateDbSubgraph();
