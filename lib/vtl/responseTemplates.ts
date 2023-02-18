export const responseTemplate = {
  "application/json": `
  #set($inputRoot = $input.path('$'))

  #if($input.path('$.status').toString().equals("FAILED"))
    #set($context.responseOverride.status = 500)
    {
      "success": false,
      "message": "$input.path('$.error')",
    }
  #else
    {
      "id": "$context.requestId",
      "output": "$util.escapeJavaScript($input.path('$.output'))"
    }
  #end`,
};
