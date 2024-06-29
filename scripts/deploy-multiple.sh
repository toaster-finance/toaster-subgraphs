#!/bin/bash

# Initial Values
network=""
protocol=""
env=""
totalGraphs=""

# 모든 인자를 반복하며 처리
for arg in "$@"; do
    case "$arg" in
    network=*) network="${arg#network=}" ;;
    protocol=*) protocol="${arg#protocol=}" ;;
    env=*) env="${arg#env=}" ;;
    totalGraphs=*) totalGraphs="${arg#totalGraphs=}" ;;
    *) ;;
    esac
done

# 필수 인자가 입력되지 않은 경우 에러 출력 후 종료
if [[ -z "$network" || -z "$protocol" || -z "$env" || -z "$totalGraphs" ]]; then
    echo "Error: Required arguments missing. Usage: $0 network=<network> protocol=<protocol> env=<local|prod> totalGraphs=<number>"
    exit 1
fi

if [[ "$env" != "prod" && "$env" != "local" ]]; then
    echo "Error: Invalid environment specified. Environment must be 'prod' or 'local'."
    exit 1
fi

# env 파일을 통한 graph key 가져오기
if [[ -f ".env.$env" ]]; then
    source ".env.$env"
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
# 하이픈을 공백으로 변경
protocolName=$(echo "$protocol" | sed -e 's/-/ /g')

# 각 단어의 첫 글자를 대문자로 변경
protocolName=$(echo "$protocolName" | awk '{
    for(i=1; i<=NF; i++) {
        firstChar = substr($i, 1, 1)
        rest = substr($i, 2)
        if (firstChar ~ /[a-z]/) {
            $i = toupper(firstChar) rest
        }
    }
    print
}')
# netwok2ChainId 에서 network에 대응하는 chainId를 가져옴.
chainId=$(jq -r --arg network "$network" '.[$network]' update/config/network2ChainId.json)
key="$chainId"_"$protocolName"
touch update/config/temp.json
jq --arg key "$key" '.[$key] = []' update/config/subgraphs.json > update/config/temp.json && mv update/config/temp.json update/config/subgraphs.json
# 명령어 실행
for ((i = 0; i < totalGraphs; i++)); do
    echo "Running iteration with graphId=$((i + 1))"
    graphId=$((i + 1))
    # JSON 파일에 graphId 및 totalGraphs 값을 추가하여 temp.json 파일 생성
    jq ".graphId = $graphId | .totalGraphs = $totalGraphs" definitions/"$protocol"/"$protocol"."$network".json > update/config/temp.json

    # mustache 명령어를 사용하여 템플릿 렌더링
    mustache update/config/temp.json definitions/"$protocol"/subgraph."$protocol".yaml >subgraph.yaml

    # temp.json 파일 삭제
    rm update/config/temp.json

    graph codegen

    if [[ -n "$GRAPH_AUTH_KEY" ]]; then
        graph auth --studio "$GRAPH_AUTH_KEY"
    else
        echo "Error: Graph authentication key not found. Please check your .env.$env file."
        exit 1
    fi

    # Deploy할 그래프 이름 생성 (최대 30자)
    graph_name="id-$graphId-$protocol-$network"
    graph_name="${graph_name:0:30}" # 그래프 이름이 30자를 초과하면 초과하는 부분을 잘라냄
    graph_name_l=$(echo "$graph_name" | tr '[:upper:]' '[:lower:]')

    deploy_output=$(graph deploy --node https://api.studio.thegraph.com/deploy/ --studio "$graph_name_l" --version-label="v$version")
    deploy_output=$(echo "$deploy_output" | sed 's/\x1b\[[0-9;]*m//g')
    # 출력에서 URL 추출
    query_url=$(echo "$deploy_output" | awk '/Queries \(HTTP\):/{print $NF}')

    # Check for error message
    if [ $? -eq 0 ]; then
        echo -e "\033[0;33mIf Subgraph does not exist, please create it at: https://thegraph.com/studio/?show=Create\033[0m"
        echo -e "\033[0;32mPlease create a subgraph named \033[0;92m$graph_name_l\033[0;32m\033[0m"
    fi
    if [[ -n "$query_url" ]]; then
        echo "Saving query URL to file: $query_url"
        jq --arg query_url "$query_url" --arg key "$key" '.[$key] += [$query_url]' update/config/subgraphs.json >update/config/temp.json && mv update/config/temp.json update/config/subgraphs.json
    fi
done
rm subgraph.yaml
