# Source this Bash hook from the VS Code CLI after its remote-CLI early return.
codex_project_args() {
    CODEX_PROJECT_ARGS=("$@")
    local file root
    if [[ $# == 2 && ( $1 == --goto || $1 == -g ) ]]; then
        file=$2
        if [[ ! -f "$file" && $file =~ ^(.*):[0-9]+:[0-9]+$ ]]; then
            file=${BASH_REMATCH[1]}
        elif [[ ! -f "$file" && $file =~ ^(.*):[0-9]+$ ]]; then
            file=${BASH_REMATCH[1]}
        fi
    elif [[ $# == 1 && $1 != -* ]]; then
        file=$1
    else
        return 0
    fi
    [[ -f "$file" ]] || return 0
    root=$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null) || return 0
    CODEX_PROJECT_ARGS=("$root" "$@")
}
