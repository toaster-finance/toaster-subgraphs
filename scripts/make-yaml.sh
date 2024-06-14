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
