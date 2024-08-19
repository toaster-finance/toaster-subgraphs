#!/bin/bash

# Initial Values
network=""
protocol=""
env=""
graphId="null"
# 모든 인자를 반복하며 처리
for arg in "$@"; do
    case "$arg" in
    network=*) network="${arg#network=}" ;;
    protocol=*) protocol="${arg#protocol=}" ;;
    env=*) env="${arg#env=}" ;;
    *) ;;
    esac
done

if [[ -z "$network" || -z "$protocol" || -z "$env" ]]; then
    echo "Error: Required arguments missing. Usage: $0 network=<network> protocol=<protocol> env=<local|prod>"
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
# 네트워크가 'all'인 경우, definations/{protocol}/* 모든 json 파일에 대해 스크립트 실행
if [[ "$network" == "all" ]]; then
    # definitions/{protocol} 폴더에서 JSON 파일 목록 가져오기
    directory="definitions/$protocol"
    json_files=$(find "$directory" -type f -name "*.json")
    # 각 JSON 파일에 대해 deploy 스크립트 실행
    for file in $json_files; do
        filename=$(basename "$file") # 파일 이름만 추출

        # 파일 이름에서 네트워크 이름 추출
        # 파일 이름 형식 가정: [protocol].[network].json
        network_name=$(echo "$filename" | cut -d '.' -f 2) # 두 번째 필드가 네트워크 이름
        echo "Deploying $protocol on $network_name..."
        sh scripts/deploy.sh network=$network_name protocol=$protocol env=$env
    done
    exit 0
fi
# key
chainId=$(jq -r --arg network "$network" '.[$network]' ./update/config/network2ChainId.json)

protocolName=$(jq -r --arg protocol "$protocol" '.[$protocol]' ./update/config/protocol2Name.json)

key="$chainId"_"$protocolName"
# ../update/subgraphs.json에서 version과 subgraphs 배열 길이를 읽어오기
# subgraphs 배열 길이가 1 혹은 16이어야 함.
version=$(jq -r --arg key "$key" '.[$key].version' "./update/config/subgraphs.json")

subgraphs_length=$(jq --arg key "$key" '.[$key].subgraphs | length' "./update/config/subgraphs.json")
graphName=""
totalGraphs=0
# graphName 결정
if [ "$subgraphs_length" -eq 16 ]; then
    totalGraphs=16
    graphName="id-${graphId}-${protocol}-${network}"
elif [ "$subgraphs_length" -eq 1 ]; then
    graphName="${protocol}-${network}"
else
    echo "Unexpected number of subgraphs: $subgraphs_length"
    exit 1
fi

IFS='.' read -r -a version_parts <<<"$version"
major="${version_parts[0]}"
minor="${version_parts[1]}"
patch="${version_parts[2]}"
new_patch=$((patch + 1)) # 패치 버전 증가
new_version="${major}.${minor}.${new_patch}"

echo "New graph name: $graphName"
echo "New version: $new_version"

if [[ -f ".env.$env" ]]; then
    source ".env.$env"
else
    echo "Error: .env.$env file not found."
    exit 1
fi

if [[ ! -f "definitions/$protocol/$protocol.$network.json" ]]; then
    echo "Error: definitions/$protocol/$protocol.$network.json file does not exist."
    exit 1
fi

if [[ ! -f "definitions/$protocol/subgraph.$protocol.yaml" ]]; then
    echo "Error: definitions/$protocol/subgraph.$protocol.yaml file does not exist."
    exit 1
fi

if [[ -n "$GRAPH_AUTH_KEY" ]]; then
    graph auth --studio "$GRAPH_AUTH_KEY"
else
    echo "Error: Graph authentication key not found. Please check your .env."$env" file."
    exit 1
fi

jq --arg new_version "$new_version" --arg key "$key" '.[$key].version = $new_version' ./update/config/subgraphs.json >temp.json && mv temp.json ./update/config/subgraphs.json
if [ "$subgraphs_length" -eq 16 ]; then
    jq --arg key "$key" '.[$key].subgraphs = []' ./update/config/subgraphs.json >temp.json && mv temp.json ./update/config/subgraphs.json
    for ((i = 0; i < totalGraphs; i++)); do
        echo "Running iteration with graphId=$((i + 1))"
        graphId=$((i + 1))
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
            echo "Error: Graph authentication key not found. Please check your .env.$env file."
            exit 1
        fi

        # Deploy할 그래프 이름 생성 (최대 30자)
        graph_name="id-$graphId-$protocol-$network"
        graph_name="${graph_name:0:30}" # 그래프 이름이 30자를 초과하면 초과하는 부분을 잘라냄
        graph_name_l=$(echo "$graph_name" | tr '[:upper:]' '[:lower:]')
        echo "$new_version"
        deploy_output=$(graph deploy --node https://api.studio.thegraph.com/deploy/ --studio "$graph_name_l" --version-label="v$new_version")
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
            jq --arg query_url "$query_url" --arg key "$key" '.[$key].subgraphs += [$query_url]' ./update/config/subgraphs.json >temp.json && mv temp.json ./update/config/subgraphs.json
        fi
        sleep 3
    done
else
    # JSON 파일에 graphId 및 totalGraphs 값을 추가하여 temp.json 파일 생성
    echo definitions/"$protocol"/"$protocol"."$network".json
    jq ".graphId = $graphId | .totalGraphs = $totalGraphs" definitions/"$protocol"/"$protocol"."$network".json >temp.json

    # mustache 명령어를 사용하여 템플릿 렌더링
    mustache temp.json definitions/"$protocol"/subgraph."$protocol".yaml >subgraph.yaml

    # temp.json 파일 삭제
    rm temp.json

    graph codegen

    # Deploy할 그래프 이름 생성 (최대 30자)
    graph_name="test-$protocol-$network"
    graph_name="${graph_name:0:30}" # 그래프 이름이 30자를 초과하면 초과하는 부분을 잘라냄
    graph_name=$(echo "$graph_name" | tr '[:upper:]' '[:lower:]')
    # for deubgging
    # graph deploy --node https://api.studio.thegraph.com/deploy/ --studio "$graph_name" --version-label="v$version"
    deploy_output=$(graph deploy --node https://api.studio.thegraph.com/deploy/ --studio "$graph_name" --version-label="v$new_version")
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

    # URL이 유효한지 확인하고 파일에 저장
    if [[ -n "$query_url" ]]; then
        echo "Saving query URL to file: $query_url"
        jq --arg query_url "$query_url" --arg key "$key" '.[$key].subgraphs += [$query_url]' ./update/config/subgraphs.json >temp.json && mv temp.json ./update/config/subgraphs.json
    fi
fi

# Check
new_subgraphs_length=$(jq --arg key "$key" '.[$key].subgraphs | length' "./update/config/subgraphs.json")
if [ "$new_subgraphs_length" -ne "$subgraphs_length" ]; then
    echo "Error: Subgraphs length mismatch. Expected $subgraphs_length, got $new_subgraphs_length"
    exit 1
fi
# Clean up
rm subgraph.yaml
