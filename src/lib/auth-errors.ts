export function getAuthPageErrorMessage(error: string | null | undefined) {
    switch (error) {
        case "network":
            return "现在暂时连不上 Supabase，请检查网络后再试。";
        case "callback":
            return "认证回调没有完成，请重新登录或重新发起重置密码流程。";
        default:
            return null;
    }
}
