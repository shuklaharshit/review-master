import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { cn } from '../ui/cn'

/** Sanitised GitHub-flavoured markdown, used for every comment/review body. */
export function CommentMarkdown({ children, className }: { children: string; className?: string }): JSX.Element {
  return (
    <div className={cn('markdown-body text-[12.5px] leading-relaxed', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {children || '_No description provided._'}
      </ReactMarkdown>
    </div>
  )
}
