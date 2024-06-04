#!/bin/bash

# Initial Values
network=""
protocol=""
env=""

# 모든 인자를 반복하며 처리
for arg in "$@"; do
    case "$arg" in
    network=*) network="${arg#network=}" ;;
    protocol=*) protocol="${arg#protocol=}" ;;
    env=*) env="${arg#env=}" ;;
    *) ;;
    esac
done

# 필수 인자가 입력되지 않은 경우 에러 출력 후 종료
if [[ -z "$network" || -z "$protocol" || -z "$env" ]]; then
    echo "Error: Required arguments missing. Usage: $0 network=<network> protocol=<protocol> env=<local|prod>"
    exit 1
fi

# env 파일을 통한 graph key 가져오기
if [[ -f ".env.$env" ]]; then
    source ".env.$env"
else
    echo "Error: .env.$env file not found."
    exit 1
fi

# 파일의 존재 여부 확인
if [[ ! -f "definitions/$protocol/$protocol.$network.json" ]]; then
    echo "Error: definitions/$protocol/$protocol.$network.json file does not exist."
    exit 1
fi

if [[ ! -f "definitions/$protocol/subgraph.$protocol.yaml" ]]; then
    echo "Error: definitions/$protocol/subgraph.$protocol.yaml file does not exist."
    exit 1
fi

version=$(jq -r '.version' definitions/"$protocol"/"$protocol"."$network".json)
if [ -z "$version" ] || [ "$version" == "null" ]; then
  echo "The 'version' value is missing. Please input a 'version' value in definitions/${protocol}/${protocol}.${network}.json"
else
  echo "The subgraph version is: $version"
fi
graphId=0
totalGraphs=0
# JSON 파일에 graphId 및 totalGraphs 값을 추가하여 temp.json 파일 생성
jq ".graphId = $graphId | .totalGraphs = $totalGraphs" definitions/"$protocol"/"$protocol"."$network".json >temp.json

# mustache 명령어를 사용하여 템플릿 렌더링
mustache temp.json definitions/"$protocol"/subgraph."$protocol".yaml >subgraph.yaml

# temp.json 파일 삭제
rm temp.json

graph codegen

if [[ -n "$GRAPH_AUTH_KEY" ]]; then
    graph auth --studio "$GRAPH_AUTH_KEY"
else
    echo "Error: Graph authentication key not found. Please check your .env."$env" file."
    exit 1
fi

# Deploy할 그래프 이름 생성 (최대 30자)
graph_name="test-$protocol-$network"
graph_name="${graph_name:0:30}" # 그래프 이름이 30자를 초과하면 초과하는 부분을 잘라냄
graph_name=$(echo "$graph_name" | tr '[:upper:]' '[:lower:]')
# for deubgging
# graph deploy --node https://api.studio.thegraph.com/deploy/ --studio "$graph_name" --version-label="v$version"
deploy_output=$(graph deploy --node https://api.studio.thegraph.com/deploy/ --studio "$graph_name" --version-label="v$version")
deploy_output=$(echo "$deploy_output" | sed 's/\x1b\[[0-9;]*m//g')
# Check for error message
if [ $? -ne 0 ]; then
    echo "Error during deployment: $deploy_output"
    exit 1
else
    echo "\033[0;33mIf Subgraph does not exist, please create it at: https://thegraph.com/studio/?show=Create\033[0m"
    echo "\033[0;32mPlease create a subgraph named \033[0;92m$graph_name\033[0;32m\033[0m"
fi
# 출력에서 URL 추출
query_url=$(echo "$deploy_output" | awk '/Queries \(HTTP\):/{print $NF}')
# netwok2ChainId 에서 network에 대응하는 chainId를 가져옴.
chainId=$(jq -r --arg network "$network" '.[$network]' network2ChainId.json)
# 하이픈을 공백으로 변경
protocol=$(echo "$protocol" | sed -e 's/-/ /g')

# 각 단어의 첫 글자를 대문자로 변경
protocol=$(echo "$protocol" | awk '{
    for(i=1; i<=NF; i++) {
        firstChar = substr($i, 1, 1)
        rest = substr($i, 2)
        if (firstChar ~ /[a-z]/) {
            $i = toupper(firstChar) rest
        }
    }
    print
}')

key="$chainId"_"$protocol"

# URL이 유효한지 확인하고 파일에 저장
if [[ -n "$query_url" ]]; then
    echo "Saving query URL to file: $query_url"
    jq -r --arg key "$key" --arg query_url "$query_url" '.[$key] = $query_url' subgraphs.json > temp.json && mv temp.json subgraphs.json
fi
# rm subgraph.yaml
